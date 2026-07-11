import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type express from 'express';
import crypto from 'node:crypto';
import { CareerPacketSchema } from '@livingcv/shared';
import {
  getDb,
  upsertSyncedState,
  getBlogBySlug,
  getBlogById,
  insertBlog,
  updateBlogBySlugOrId,
  listBlogPosts,
} from './db.js';
import { getSetting } from './settings.js';

// Shared state for connections
const transports = new Map<string, SSEServerTransport>();

// Description handed to any LLM that connects. It documents the JSON-encoded
// columns precisely so a client writing raw SQL cannot guess field names wrong
// (the failure that left project cards blank when body was written with
// design_decision/whats_real instead of the columns shape).
const SQL_TOOL_DESCRIPTION = `Execute raw SQL against the portfolio SQLite database (better-sqlite3). method 'get'/'all' to read, 'run' to mutate. Every table is reachable — this is the operator's private data.

CRITICAL — these columns hold JSON and are parsed by the site renderer. Write EXACTLY these shapes:
• projects.body → {"columns":[{"heading":"Design decision","body":"..."},{"heading":"What's real","body":"..."}]}
  Each column renders with its own heading; up to 3 sit per row and any beyond wrap to the next line. Headings are free text — you choose them (they are NOT fixed).
  DO NOT write the keys design_decision / whats_real / honest_constraint, nor camelCase designDecision / whatsReal / honestConstraint. Those legacy shapes are only tolerated when READING old rows; always WRITE the {"columns":[...]} shape or the card renders blank.
• projects.stack → JSON array of strings, e.g. ["TypeScript","SQLite"].
• projects.diagram_svg → raw inline <svg>…</svg> markup (NOT JSON). Use stroke="currentColor" so it matches the site theme.
• site_content.content → JSON whose shape depends on section_key (hero, background, footer, theme, order, hidden, custom_sections).
• case_studies.frontmatter → JSON: { title, summary, stack:[], status, links:{}, highlights:[] }.

HERO DIAGRAM CONTRACT (site_content WHERE section_key='hero'):
The hero JSON may include a top-level "diagram" object to control the node diagram:
  {
    "diagram": {
      "enabled":     true,         // false → hides the diagram entirely
      "centerLabel": "Mohith",     // center-node text; falls back to diagramCenterLabel then first name
      "nodes": [                   // 1–6 explicit nodes; omit to auto-derive from featured projects
        { "label": "jobops",    "sublabel": "npm",  "href": "#jobops",     "accent": "signal" },
        { "label": "HireBridge","sublabel": "Go",   "href": "#hirebridge", "accent": "rust"   }
      ],
      "layout":  "corners",        // "corners" (default, 4 max) | "arc" | "radial" (both up to 6)
      "animate": true              // draw-in animation; always off when prefers-reduced-motion
    }
  }
accent values: "signal" (green) | "rust" (terracotta) | "ink" (dark).
Safe update pattern: SELECT content FROM site_content WHERE template_slug='classic' AND section_key='hero' ORDER BY id DESC LIMIT 1 — then merge and INSERT a new row (setSection appends; old rows are pruned automatically, do NOT DELETE).

SECTION LABELS CONTRACT (site_content WHERE section_key='section_labels'):
A JSON map of section IDs to overriding labels. If a field is omitted, the template defaults are used.
  {
    "projects":    { "kicker": "01 — Selected work", "title": "Projects",      "navLabel": "Projects" },
    "alsoShipped": { "kicker": "02 — Also shipped",  "title": "Smaller tools", "navLabel": "Also Shipped" },
    "background":  { "kicker": "03 — Before this",   "title": "Background",    "navLabel": "Background" },
    "signals":     { "kicker": "Signals",            "title": "Signals",       "navLabel": "Signals" },
    "contact":     { "kicker": "Get in touch",       "title": "Contact",       "navLabel": "Contact" }
  }

WORKFLOW for JSON columns: SELECT the current value first, merge your change into the existing JSON, then write the whole object back — never blind-overwrite.

DO NOT UPDATE app_settings rows whose keys are secrets (jobops.auth_token, agent.llm_api_key, any *_api_key, notify.webhook_url, mcp.master_key, telegram.bot_token, google.client_secret). They are AES-encrypted by the app; a raw SQL write stores unusable plaintext. Change secrets through the admin UI instead.

BLOGS TABLE:
  blogs(id, slug UNIQUE, title, summary, body_markdown, published, tags, created_at, updated_at)
  • tags is stored as a comma-separated string (e.g. "react, nextjs, ai"). The web UI parses it with .split(',').map(t => t.trim()).
  • published is 0 or 1.
  • created_at / updated_at are ISO 8601 strings (new Date().toISOString()).
  • body_markdown is compiled as MDX (next-mdx-remote/rsc + remarkGfm). GFM markdown works, inline JSX / <svg> works, but a stray { or < outside a code fence is MDX syntax and can break that post's page — escape literal braces as &#123; or wrap in a code fence.
  • The blog pages are force-dynamic, so an INSERT is live on /blog/<slug> immediately — no revalidation step.
  • PREFER the dedicated publish_blog_post / update_blog_post / list_blog_posts tools over raw INSERTs: they validate inputs, generate slugs, and prevent the slug-collision silent-overwrite hazard.`;

// ── blog tool helpers (pure functions, testable without an SSE server) ────────

// Turn an arbitrary title into a URL-safe kebab-case slug. Collapses runs of
// non-alphanumerics into a single hyphen, trims leading/trailing hyphens,
// lowercases. The same shape the web app's blog editor already produces.
function kebabSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// If the desired slug is taken, append -2, -3, ... until a free one is found.
// Returns the original slug if free.
function ensureUniqueSlug(db: ReturnType<typeof getDb>, base: string): string {
  if (!getBlogBySlug(db, base)) return base;
  let n = 2;
  while (getBlogBySlug(db, `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Surface a SQLite UNIQUE-constraint violation as a clean error message that
// names the conflicting slug and points at update_blog_post. The MCP handler
// for publish_blog_post calls this when the caller-supplied slug is taken.
function isUniqueSlugError(e: unknown): boolean {
  return Boolean(
    e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE',
  );
}

// ── blog tool handlers (exported for unit tests) ────────────────────────────
//
// Each handler takes the raw MCP arguments object and returns a CallToolResult.
// The MCP dispatch in `attachMasterMcp` is a one-liner per tool.

export function handlePublishBlogPost(args: unknown): CallToolResult {
  const a = (args ?? {}) as {
    title?: unknown;
    body_markdown?: unknown;
    slug?: unknown;
    summary?: unknown;
    tags?: unknown;
    published?: unknown;
  };
  const title = typeof a.title === 'string' ? a.title.trim() : '';
  const body = typeof a.body_markdown === 'string' ? a.body_markdown : '';
  if (!title) {
    return { content: [{ type: 'text', text: 'Missing required argument: title' }], isError: true };
  }
  if (!body) {
    return { content: [{ type: 'text', text: 'Missing required argument: body_markdown' }], isError: true };
  }
  const summary = typeof a.summary === 'string' ? a.summary : '';
  const published = a.published === false ? 0 : 1;
  const tags = Array.isArray(a.tags)
    ? a.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).join(', ')
    : '';

  const db = getDb();
  const requestedSlug = typeof a.slug === 'string' && a.slug.trim().length > 0
    ? a.slug.trim()
    : kebabSlug(title);
  if (!requestedSlug) {
    return {
      content: [{ type: 'text', text: `Could not derive a slug from title "${title}". Pass an explicit slug.` }],
      isError: true,
    };
  }

  // If the caller passed an explicit slug, fail loudly on collision. If they
  // omitted it, fall back to -2 / -3 suffixes to find a free auto-slug.
  const slug = typeof a.slug === 'string'
    ? requestedSlug
    : ensureUniqueSlug(db, requestedSlug);

  if (getBlogBySlug(db, slug)) {
    return {
      content: [{ type: 'text', text: `Slug "${slug}" is already in use. Use update_blog_post to modify it (slug: "${slug}").` }],
      isError: true,
    };
  }

  try {
    const id = insertBlog(db, { slug, title, summary, body_markdown: body, tags, published });
    const state = published === 1 ? `published (live on /blog/${slug})` : 'saved as draft';
    return {
      content: [{ type: 'text', text: `Blog post ${state}. id=${id} slug="${slug}" url=/blog/${slug}` }],
    };
  } catch (e: unknown) {
    if (isUniqueSlugError(e)) {
      return {
        content: [{ type: 'text', text: `Slug "${slug}" is already in use. Use update_blog_post to modify it.` }],
        isError: true,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: `Failed to publish blog post: ${msg}` }], isError: true };
  }
}

export function handleUpdateBlogPost(args: unknown): CallToolResult {
  const a = (args ?? {}) as {
    slug?: unknown;
    id?: unknown;
    title?: unknown;
    body_markdown?: unknown;
    summary?: unknown;
    tags?: unknown;
    published?: unknown;
    new_slug?: unknown;
  };
  const locator: { slug?: string; id?: number } = {};
  if (typeof a.slug === 'string' && a.slug.trim()) locator.slug = a.slug.trim();
  else if (typeof a.id === 'number' && Number.isFinite(a.id)) locator.id = a.id;
  else {
    return { content: [{ type: 'text', text: 'Provide either slug or id to locate the post.' }], isError: true };
  }

  const patch: Parameters<typeof updateBlogBySlugOrId>[2] = {};
  if (typeof a.title === 'string') patch.title = a.title;
  if (typeof a.body_markdown === 'string') patch.body_markdown = a.body_markdown;
  if (typeof a.summary === 'string') patch.summary = a.summary;
  if (Array.isArray(a.tags)) {
    patch.tags = a.tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ');
  }
  if (a.published === true) patch.published = 1;
  else if (a.published === false) patch.published = 0;
  if (typeof a.new_slug === 'string' && a.new_slug.trim()) patch.new_slug = a.new_slug.trim();

  try {
    const db = getDb();
    const changes = updateBlogBySlugOrId(db, locator, patch);
    if (changes === 0) {
      return {
        content: [{
          type: 'text',
          text: `No blog post matched ${locator.id !== undefined ? `id=${locator.id}` : `slug="${locator.slug}"`}.`,
        }],
        isError: true,
      };
    }
    const current = locator.id !== undefined
      ? getBlogById(db, locator.id)
      : getBlogBySlug(db, patch.new_slug ?? locator.slug!);
    return { content: [{ type: 'text', text: JSON.stringify(current, null, 2) }] };
  } catch (e: unknown) {
    if (isUniqueSlugError(e)) {
      return {
        content: [{ type: 'text', text: `Slug rename failed: "${patch.new_slug}" is already in use.` }],
        isError: true,
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: `Failed to update blog post: ${msg}` }], isError: true };
  }
}

export function handleListBlogPosts(args: unknown): CallToolResult {
  const a = (args ?? {}) as { published_only?: unknown };
  const publishedOnly = a.published_only === true;
  const db = getDb();
  const rows = listBlogPosts(db, publishedOnly);
  return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
}

export function attachMasterMcp(app: express.Express) {
  app.get('/api/mcp/sse', async (req, res) => {
    try {
      const db = getDb();
      const enabled = getSetting(db, 'mcp.enabled') === '1';
      if (!enabled) {
        return res.status(403).send('Master MCP is disabled');
      }

      const token = req.get('Authorization')?.replace('Bearer ', '');
      const masterKey = getSetting(db, 'mcp.master_key');
      
      if (!masterKey || !token || token.length !== masterKey.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(masterKey))) {
        return res.status(401).send('Unauthorized');
      }

      // Set up the jobops relay client for this connection
      const jobopsUrl = process.env.JOBOPS_BASE_URL || 'http://jobops:7891';
      const jobopsToken = getSetting(db, 'jobops.auth_token') || process.env.JOBOPS_AUTH_TOKEN || '';
      
      const jobopsTransport = new StreamableHTTPClientTransport(new URL(`${jobopsUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${jobopsToken}` } },
      });
      const jobopsClient = new Client({ name: 'master-relay', version: '1.0.0' });
      
      try {
        await jobopsClient.connect(jobopsTransport);
      } catch (e) {
        console.error('[masterMcp] failed to connect to jobops', e);
      }

      const server = new Server({
        name: "livingcv-master-mcp",
        version: "1.0.0"
      }, {
        capabilities: { tools: {} }
      });

      server.setRequestHandler(ListToolsRequestSchema, async () => {
        const syncEnabled = getSetting(getDb(), 'mcp.jobops_sync_enabled') === '1';
        const localTools: Tool[] = [
          {
            name: 'portfolio_execute_sql',
            description: SQL_TOOL_DESCRIPTION,
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'SQL query to execute' },
                params: { type: 'array', items: { type: 'string' } },
                method: { type: 'string', enum: ['run', 'get', 'all'], description: 'SQLite method to use. "run" for mutations, "get" for single row, "all" for multiple rows' }
              },
              required: ['query', 'method']
            }
          },
          {
            name: 'publish_blog_post',
            description:
              `Publish a new blog post directly into the shared portfolio.db blogs table. The post goes live immediately on /blog/<slug> because the blog routes are force-dynamic. ` +
              `Body is compiled as MDX (next-mdx-remote/rsc + remarkGfm): GFM markdown works, inline JSX and <svg> work, but a stray { or < outside a code fence is MDX syntax and can break that post's page — escape literal braces as &#123; or wrap in a code fence. ` +
              `Tags are stored as a comma-separated string ("react, nextjs, ai") and parsed back with .split(',').map(t=>t.trim()) on render. ` +
              `Provide either slug or let it auto-generate a kebab-case slug from title. Slug collision returns an error pointing at update_blog_post — this tool never silently overwrites.`,
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Post title (required).' },
                body_markdown: { type: 'string', description: 'Post body in MDX/GFM markdown (required).' },
                slug: { type: 'string', description: 'URL slug. Optional — auto-generates a kebab-case slug from title if omitted.' },
                summary: { type: 'string', description: 'Short blurb shown on the blog index. Optional, default "".' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tag list (optional). Joined with ", " for storage.' },
                published: { type: 'boolean', description: 'true → live on /blog/<slug> immediately; false → saved as draft. Optional, default true.' },
              },
              required: ['title', 'body_markdown'],
            },
          },
          {
            name: 'update_blog_post',
            description:
              `Partially update a blog post identified by slug or id. Only the fields you pass are changed (including tags) — everything else is preserved. Always bumps updated_at. Use new_slug to rename the URL. Returns the post's current row after the patch.`,
            inputSchema: {
              type: 'object',
              properties: {
                slug: { type: 'string', description: 'Locate by current slug. Provide slug OR id.' },
                id: { type: 'number', description: 'Locate by row id. Provide slug OR id.' },
                title: { type: 'string' },
                body_markdown: { type: 'string' },
                summary: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tag list (joined with ", "). Omit to leave tags unchanged.' },
                published: { type: 'boolean' },
                new_slug: { type: 'string', description: 'Rename the URL slug. Omit to leave slug unchanged.' },
              },
            },
          },
          {
            name: 'list_blog_posts',
            description:
              `List blog posts with their metadata (id, slug, title, summary, published, tags, created_at, updated_at). Body is omitted — use listBlogPosts metadata to decide what to fetch next.`,
            inputSchema: {
              type: 'object',
              properties: {
                published_only: { type: 'boolean', description: 'If true, skip drafts. Optional, default false.' },
              },
            },
          },
        ];
        if (syncEnabled) {
          localTools.push({
            name: 'sync_career_packet',
            description: `Accept a career-packet snapshot from JobOps and store it locally so the portfolio's public /career-packet.json route serves it without contacting JobOps. The packet is validated against the CareerPacketSchema before storage. Only whitelisted fields are accepted; unknown fields are silently dropped. This tool writes ONLY to synced_state — it cannot touch app_settings, site_content, projects, or any other config table.`,
            inputSchema: {
              type: 'object',
              properties: {
                packet: { type: 'object', description: 'Career packet JSON conforming to CareerPacketSchema (identity, taglines, experience, projects, skills, education, summary, version)' }
              },
              required: ['packet']
            }
          });
        }

        let jobopsTools: Tool[] = [];
        try {
          const res = await jobopsClient.listTools();
          jobopsTools = res.tools;
        } catch (e) {
          console.error('[masterMcp] failed to list jobops tools', e);
        }

        return {
          tools: [...localTools, ...jobopsTools]
        };
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === 'sync_career_packet') {
          const db = getDb();
          const syncEnabled = getSetting(db, 'mcp.jobops_sync_enabled') === '1';
          if (!syncEnabled) {
            return {
              content: [{ type: 'text', text: 'JobOps sync is disabled. Enable "mcp.jobops_sync_enabled" in admin settings.' }],
              isError: true,
            } as CallToolResult;
          }
          const raw = (request.params.arguments as { packet?: unknown })?.packet;
          if (!raw) {
            return {
              content: [{ type: 'text', text: 'Missing required argument: packet' }],
              isError: true,
            } as CallToolResult;
          }
          const parsed = CareerPacketSchema.safeParse(raw);
          if (!parsed.success) {
            return {
              content: [{ type: 'text', text: `Career packet validation failed: ${parsed.error.message}` }],
              isError: true,
            } as CallToolResult;
          }
          try {
            const json = JSON.stringify(parsed.data);
            upsertSyncedState(db, 'career_packet', json, 'jobops');
            return {
              content: [{ type: 'text', text: `Career packet synced successfully (${json.length} bytes). Identity: ${parsed.data.identity.fullName}` }],
            } as CallToolResult;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
              content: [{ type: 'text', text: `Failed to store career packet: ${msg}` }],
              isError: true,
            } as CallToolResult;
          }
        }
        if (request.params.name === 'portfolio_execute_sql') {
          const { query, params = [], method } = request.params.arguments as { query: string; params?: unknown[]; method: string };
          console.log(`[masterMcp] executing SQL (method=${method}): ${query}`);
          try {
            const db = getDb();
            let result;
            if (method === 'run') {
              result = db.prepare(query).run(...params);
            } else if (method === 'get') {
              result = db.prepare(query).get(...params);
            } else {
              result = db.prepare(query).all(...params);
            }
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
              content: [{ type: 'text', text: `SQL Error: ${msg}` }],
              isError: true
            };
          }
        }
        if (request.params.name === 'publish_blog_post') {
          return handlePublishBlogPost(request.params.arguments);
        }
        if (request.params.name === 'update_blog_post') {
          return handleUpdateBlogPost(request.params.arguments);
        }
        if (request.params.name === 'list_blog_posts') {
          return handleListBlogPosts(request.params.arguments);
        } else {
          // Pass through to jobops
          try {
            const result = await jobopsClient.callTool({
              name: request.params.name,
              arguments: request.params.arguments
            });
            return result as CallToolResult;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
              content: [{ type: 'text', text: `JobOps Error: ${msg}` }],
              isError: true
            };
          }
        }
      });

      // The path the client is told to POST messages back to. Behind the Caddy
      // `/mcp-admin/*` route this must be the EXTERNAL path (/mcp-admin/messages),
      // which Caddy rewrites back to /api/mcp/messages here. Defaults to the raw
      // path for direct (non-proxied) use. Set MCP_MESSAGES_PATH in compose.
      const messagesPath = process.env.MCP_MESSAGES_PATH || '/api/mcp/messages';
      const transport = new SSEServerTransport(messagesPath, res);
      transports.set(transport.sessionId, transport);

      // SSE keepalive: undici-based clients (Node >= 26 defaults bodyTimeout
      // 300_000, gap between body chunks) sever idle streams. A comment frame
      // every 25 s keeps the connection open without `Connection: keep-alive`.
      const keepalive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 25_000);

      res.on('close', () => {
        clearInterval(keepalive);
        transports.delete(transport.sessionId);
        jobopsClient.close().catch(console.error);
      });

      await server.connect(transport);
    } catch (e) {
      console.error('[masterMcp] sse error', e);
      res.status(500).end();
    }
  });

  app.post('/api/mcp/messages', async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      const transport = transports.get(sessionId);
      if (!transport) {
        return res.status(404).send('Session not found');
      }
      // The global express.json() middleware has already consumed and parsed the
      // request stream, so pass the parsed body — otherwise handlePostMessage tries
      // to re-read the stream and fails with "stream is not readable".
      await transport.handlePostMessage(req, res, req.body);
    } catch (e) {
      console.error('[masterMcp] post messages error', e);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  });
}

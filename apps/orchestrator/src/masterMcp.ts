import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type express from 'express';
import crypto from 'node:crypto';
import { CareerPacketSchema } from '@livingcv/shared';
import { getDb, upsertSyncedState } from './db.js';
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

WORKFLOW for JSON columns: SELECT the current value first, merge your change into the existing JSON, then write the whole object back — never blind-overwrite.

DO NOT UPDATE app_settings rows whose keys are secrets (jobops.auth_token, agent.llm_api_key, any *_api_key, notify.webhook_url, mcp.master_key, telegram.bot_token, google.client_secret). They are AES-encrypted by the app; a raw SQL write stores unusable plaintext. Change secrets through the admin UI instead.`;

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
          }
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
      
      res.on('close', () => {
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

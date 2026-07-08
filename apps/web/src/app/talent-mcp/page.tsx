import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { recordPageView } from '@/lib/page-views';
import { SETTING_KEYS } from '@livingcv/shared';
import { BASE_CSS } from '@/templates/classic/styles';

export const dynamic = 'force-dynamic';

const PAGE_CSS = `
main.mcp-wrap{ max-width: 760px; margin:0 auto; padding:56px 24px 90px; }
.mcp-kicker{ font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px; }
h1.mcp-title{ font-family:'Space Grotesk', sans-serif; font-size:clamp(2.2rem,5vw,3.2rem); font-weight:700; letter-spacing:-0.02em; margin:0 0 20px; line-height:1.1; color:var(--ink); }
.mcp-lead{ font-size:1.1rem; color:var(--ink-soft); margin:0 0 32px; line-height:1.6; }
.mcp-wrap h2{ font-family:'Space Grotesk', sans-serif; font-size:1.4rem; margin:40px 0 12px; color:var(--ink); }
.mcp-wrap p{ line-height:1.7; color:var(--ink); }
.mcp-wrap ol, .mcp-wrap ul{ line-height:1.8; color:var(--ink); padding-left:22px; }
.mcp-endpoint{ display:block; font-family:'JetBrains Mono', monospace; font-size:1.05rem; background:var(--paper-deep); border:1px solid var(--rule); border-radius:6px; padding:14px 16px; margin:8px 0 4px; word-break:break-all; color:var(--ink); }
.mcp-wrap pre{ background:var(--paper-deep); border:1px solid var(--rule); border-radius:6px; padding:16px; overflow-x:auto; font-family:'JetBrains Mono', monospace; font-size:0.85rem; line-height:1.5; color:var(--ink); }
.mcp-wrap code{ font-family:'JetBrains Mono', monospace; font-size:0.9em; }
.mcp-tool{ border:1px solid var(--rule); border-radius:6px; padding:14px 16px; margin:10px 0; }
.mcp-tool b{ font-family:'JetBrains Mono', monospace; color:var(--signal); }
.mcp-back{ display:inline-block; margin-bottom:24px; color:var(--ink-soft); text-decoration:none; font-size:0.9rem; }
.mcp-back:hover{ color:var(--signal); }
`;

export async function generateMetadata(): Promise<Metadata> {
  const db = getDb();
  const s = getAllSettings(db);
  const enabled = (s[SETTING_KEYS.publicMcpEnabled] ?? '0') === '1';
  if (!enabled) return { title: 'Not found', robots: { index: false } };
  const site = s['site.title'] || s['site.domain'] || 'Portfolio';
  return {
    title: { absolute: `Connect your AI agent · ${site}` },
    description: `Connect your recruiter AI agent to ${site}'s public MCP endpoint to fetch structured career details.`,
  };
}

export default async function TalentMcpPage() {
  const db = getDb();
  const s = getAllSettings(db);
  const enabled = (s[SETTING_KEYS.publicMcpEnabled] ?? '0') === '1';
  if (!enabled) notFound();

  recordPageView(db, '/talent-mcp');

  const site = s['site.title'] || 'this portfolio';
  const domain = (s['site.domain'] || '').trim();
  const base = domain
    ? (domain.includes('localhost') ? `http://${domain}` : `https://${domain}`)
    : 'https://YOUR-DOMAIN';
  const endpoint = `${base}/mcp/public`;

  const example = `curl -sN ${endpoint} \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <main className="mcp-wrap">
        <a href="/" className="mcp-back">← Back to {site}</a>
        <p className="mcp-kicker">TalentMCP · Model Context Protocol</p>
        <h1 className="mcp-title">Connect your AI agent</h1>
        <p className="mcp-lead">
          {site} exposes a public, read-only <strong>MCP endpoint</strong> so your
          recruiting AI agent — Claude, ChatGPT, or any Model Context Protocol
          client — can pull structured career details directly, no scraping or
          copy-paste required.
        </p>

        <h2>The endpoint</h2>
        <code className="mcp-endpoint">{endpoint}</code>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          Open, unauthenticated, POST-only (streamable HTTP MCP transport).
        </p>

        <h2>What it exposes</h2>
        <div className="mcp-tool">
          <b>get_career_packet</b>
          <p style={{ margin: '6px 0 0' }}>
            A curated career summary — background, highlights, and a projects
            section — as structured markdown.
          </p>
        </div>
        <div className="mcp-tool">
          <b>get_story_bank_public</b>
          <p style={{ margin: '6px 0 0' }}>
            Reviewed STAR-style stories (situation, action, reflection, competency
            tags) suitable for behavioural screening.
          </p>
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          Nothing else is reachable here — no contact lists, no private job-search
          data, no write access.
        </p>

        <h2>Add it to Claude or ChatGPT</h2>
        <ol>
          <li>
            In your MCP client&apos;s connector / custom-connector settings, add a
            new <strong>remote MCP server</strong>.
          </li>
          <li>
            Paste the URL above (<code>{endpoint}</code>) as the server URL. No API
            key or token is needed.
          </li>
          <li>
            Save and connect. Your agent will see the two tools listed above and can
            call them while helping you evaluate {site}.
          </li>
        </ol>

        <h2>Try it from a terminal</h2>
        <pre>{example}</pre>
      </main>
    </>
  );
}

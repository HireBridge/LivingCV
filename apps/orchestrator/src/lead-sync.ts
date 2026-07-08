import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Db } from '@livingcv/db';
import { getSetting } from './settings.js';
import { systemLog } from '@livingcv/db';

export interface LeadToSync {
  email: string;
  domain: string;
  channel: string;
  sessionId: string;
}

// Best-effort push of a verified lead to the JobOps application tracker via
// its add_contacts MCP tool. Non-throwing — errors are logged to system_logs
// and never block the caller.
//
// TODO(verify): confirm add_contacts inputSchema accepts is_recruiter/company.
// The authenticated jobops /mcp was unreachable at review time. Currently only
// full_name, email, and notes are sent — add is_recruiter and company once the
// schema is confirmed.
export async function syncLeadToJobOps(db: Db, lead: LeadToSync): Promise<void> {
  const baseUrl = process.env.JOBOPS_BASE_URL || 'http://jobops:7891';
  const token = getSetting(db, 'jobops.auth_token') || process.env.JOBOPS_AUTH_TOKEN;

  if (!baseUrl || !token) {
    systemLog(db, 'warn', '[lead-sync] jobops not configured — skipping', { sessionId: lead.sessionId });
    return;
  }

  // Infer a best-effort name from the email prefix.
  const name = lead.email.split('@')[0]?.replace(/[._-]/g, ' ') || '';

  try {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'lead-sync', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const result = await client.callTool({
      name: 'add_contacts',
      arguments: {
        contacts: [{
          full_name: name,
          email: lead.email,
          notes: `AI Concierge lead, channel: ${lead.channel}, sessionId: ${lead.sessionId}`,
        }],
      },
    });

    await client.close();

    systemLog(db, 'info', '[lead-sync] synced lead to jobops', { email: lead.email, domain: lead.domain });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    systemLog(db, 'error', '[lead-sync] failed to sync lead to jobops', { error: msg });
  }
}

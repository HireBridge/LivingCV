import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import type { Db } from '@livingcv/db';

export async function getMcpClient(db: Db) {
  const baseUrl = getSetting(db, SETTING_KEYS.jobopsBaseUrl) || process.env.JOBOPS_BASE_URL;
  const token = getSetting(db, SETTING_KEYS.jobopsAuthToken) || process.env.JOBOPS_AUTH_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('jobops base URL or auth token not configured in Settings.');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/mcp`;
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'portfolio-admin', version: '1.0.0' }, { capabilities: {} });
  
  await client.connect(transport);
  return {
    client,
    async close() {
      await client.close();
    }
  };
}

export async function getCareerPacket(db: Db) {
  const mcp = await getMcpClient(db);
  try {
    const res = await mcp.client.callTool({ name: 'get_career_packet', arguments: {} });
    if (res.structuredContent) return res.structuredContent;
    const blocks = (res.content ?? []) as Array<{ type: string; text?: string }>;
    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') {
        try { return JSON.parse(b.text); } catch { return b.text; }
      }
    }
    return null;
  } finally {
    await mcp.close();
  }
}

export async function updateCareerPacket(db: Db, args: Record<string, unknown>) {
  const mcp = await getMcpClient(db);
  try {
    await mcp.client.callTool({ name: 'update_career_packet', arguments: args });
  } finally {
    await mcp.close();
  }
}

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getSetting } from './settings.js';
import { getDb } from './db.js';

async function main() {
  let masterKey = process.env.MCP_MASTER_KEY;
  let url = process.env.MCP_URL;

  if (!masterKey || !url) {
    try {
      const db = getDb();
      masterKey = masterKey || getSetting(db, 'mcp.master_key');
      url = url || 'http://127.0.0.1:8100/api/mcp/sse';
    } catch (e) {
      console.warn('Could not read from local DB:', (e as Error).message);
    }
  }

  if (!masterKey) {
    console.error('FAIL: No master key set');
    process.exit(1);
  }

  url = url || 'http://127.0.0.1:8100/api/mcp/sse';

  const transport = new SSEClientTransport(new URL(url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${masterKey}`
      }
    }
  });

  const client = new Client({ name: 'health-check', version: '1.0.0' }, { capabilities: {} });
  
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: 'portfolio_execute_sql',
      arguments: {
        query: process.argv[2] || 'SELECT 1 as ok',
        method: process.argv[3] || 'get'
      }
    });
    console.log('OK');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('FAIL', e);
    process.exit(1);
  }
}
main();

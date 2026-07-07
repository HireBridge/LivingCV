import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const url = `http://jobops:7891/mcp`;
  const token = process.env.JOBOPS_AUTH_TOKEN;
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  
  await client.connect(transport);
  const res = await client.listTools();
  const packetTool = res.tools.find(t => t.name === 'update_career_packet');
  console.log(JSON.stringify(packetTool, null, 2));
  await client.close();
}
main().catch(console.error);

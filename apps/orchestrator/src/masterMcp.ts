import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type express from 'express';
import crypto from 'node:crypto';
import { getDb } from './db.js';
import { getSetting } from './settings.js';

// Shared state for connections
const transports = new Map<string, SSEServerTransport>();

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
        const localTools = [
          {
            name: 'portfolio_execute_sql',
            description: 'Execute raw SQL on the portfolio SQLite database. This exposes every field within the system.',
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
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      return res.status(404).send('Session not found');
    }
    // The global express.json() middleware has already consumed and parsed the
    // request stream, so pass the parsed body — otherwise handlePostMessage tries
    // to re-read the stream and fails with "stream is not readable".
    await transport.handlePostMessage(req, res, req.body);
  });
}

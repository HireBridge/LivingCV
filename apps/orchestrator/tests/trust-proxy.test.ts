import { describe, it, expect } from 'vitest';
import express from 'express';
import { createServer, request } from 'node:http';
import type { IncomingMessage } from 'node:http';

function get(path: string, headers: Record<string, string>): Promise<{ status: number; ip: string | null }> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/test', (req, res) => {
      res.json({ ip: req.ip || null });
    });
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); return reject(new Error('no address')); }
      const port = addr.port;
      const url = new URL(path, `http://127.0.0.1:${port}`);
      const opts = { hostname: '127.0.0.1', port, path: url.pathname, method: 'GET', headers };
      const req = request(opts, (res: IncomingMessage) => {
        let body = '';
        res.on('data', (d: Buffer) => (body += d.toString()));
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode ?? 0, ip: JSON.parse(body).ip }); } catch { reject(new Error('parse error')); }
        });
      });
      req.on('error', (e: Error) => { server.close(); reject(e); });
      req.end();
    });
  });
}

describe('H1 — trust proxy', () => {
  it('resolves req.ip from X-Forwarded-For when trust proxy is set', async () => {
    const a = await get('/test', { 'X-Forwarded-For': '1.2.3.4' });
    const b = await get('/test', { 'X-Forwarded-For': '5.6.7.8' });
    expect(a.ip).toBe('1.2.3.4');
    expect(b.ip).toBe('5.6.7.8');
    expect(a.ip).not.toBe(b.ip);
  });

  it('uses the socket address when no X-Forwarded-For is present', async () => {
    const r = await get('/test', {});
    expect(r.ip).toBe('::ffff:127.0.0.1');
  });
});

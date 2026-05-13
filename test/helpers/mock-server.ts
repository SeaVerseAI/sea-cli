import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';

export type RouteHandler = (req: IncomingMessage, body: string) => { status: number; body: unknown };

export interface MockServerOptions {
  routes: Record<string, RouteHandler>;
}

export interface MockServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export function createMockServer(opts: MockServerOptions): Promise<MockServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const bodyStr = Buffer.concat(chunks).toString('utf-8');

      const path = new URL(req.url ?? '/', `http://localhost`).pathname;

      const handler =
        opts.routes[path] ||
        opts.routes[`${req.method} ${path}`] ||
        Object.entries(opts.routes).find(([k]) => path.startsWith(k))?.[1];

      if (handler) {
        const result = handler(req, bodyStr);
        res.writeHead(result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () => new Promise<void>((res, rej) => server.close(err => err ? rej(err) : res())),
      });
    });

    server.on('error', reject);
  });
}

export function jsonResponse(data: unknown, status = 200): { status: number; body: unknown } {
  return { status, body: data };
}

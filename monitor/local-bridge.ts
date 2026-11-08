import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Dev-only: serve the module running in SpacetimeDB's in-memory test datastore. */
export function headcountLocalBridge(): Plugin {
  return {
    name: 'headcount-local-bridge',
    apply: 'serve',
    configureServer(server) {
      const file = path.resolve(here, '../spacetimedb/local/bridge.ts');
      let bridge: Promise<{ call(n: string, a: object): void; snapshot(): unknown }> | undefined;
      const get = () => (bridge ??= server.ssrLoadModule(file).then((m) => m.createLocalBridge()));

      server.middlewares.use('/__headcount/state', async (_req, res) => {
        try {
          const b = await get();
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(b.snapshot()));
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e instanceof Error ? e.stack : e));
        }
      });

      server.middlewares.use('/__headcount/call', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const { reducer, args } = JSON.parse(body || '{}');
            (await get()).call(reducer, args ?? {});
            res.end('{}');
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          }
        });
      });
    },
  };
}

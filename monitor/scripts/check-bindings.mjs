import { existsSync } from 'node:fs';
const entry = new URL('../src/module_bindings/index.ts', import.meta.url);
if (!existsSync(entry)) {
  console.error('Missing SpacetimeDB client bindings. Run npm run generate in monitor/ and include src/module_bindings in the deployment source.');
  process.exit(1);
}

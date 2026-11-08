import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest';
import { headcountLocalBridge } from './local-bridge';
import { piBridge } from './pi-bridge';

// HEADCOUNT_SOURCE=local runs the module in-process instead of connecting to a
// SpacetimeDB server (see README "Running it").
const local = process.env.HEADCOUNT_SOURCE === 'local';

export default defineConfig({
  plugins: [react(), ...(local ? [spacetimedbModuleTestPlugin(), headcountLocalBridge()] : []), piBridge()],
  define: { __HEADCOUNT_SOURCE__: JSON.stringify(local ? 'local' : 'spacetimedb') },
  ssr: { noExternal: ['spacetimedb'] },
  server: { fs: { allow: ['..'] } },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const buildId = process.env.GAME_BUILD_ID || new Date().toISOString().replace(/[^0-9]/g, '');

export default defineConfig({
  plugins: [react(), { name: 'game-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) }); } }],
  define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
  server: { port: 5173, proxy: { '/socket.io': 'http://localhost:3001', '/health': 'http://localhost:3001' } },
  build: { outDir: 'dist/web' },
});

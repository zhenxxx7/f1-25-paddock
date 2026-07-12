import { defineConfig } from 'vite';

// Static frontend build. The Node backend (server/index.js) serves the built
// dist/ folder at runtime and also exposes the telemetry WebSocket.
const apiPort = process.env.HTTP_PORT || '3000';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    // PORT lets a harness/tool assign the dev port; default stays 5173.
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    // In dev, the WebSocket + lap API live on the Node backend.
    proxy: {
      '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
      '/api': `http://localhost:${apiPort}`,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

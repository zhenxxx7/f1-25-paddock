import { defineConfig } from 'vite';

// Static frontend build. The Node backend (server/index.js) serves the built
// dist/ folder at runtime and also exposes the telemetry WebSocket.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

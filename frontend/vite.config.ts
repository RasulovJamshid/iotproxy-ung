import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as http from 'http';
import * as dns from 'dns';

/**
 * Agent that bypasses Node's DNS cache on every new connection.
 * keepAlive: false ensures no pooled TCP connections survive a Docker container restart.
 * Without this, Vite caches the resolved IP of the backend service and keeps hitting the
 * old IP after docker-compose recreates the container with a new bridge-network address.
 */
function makeFreshDnsAgent() {
  return new http.Agent({
    keepAlive: false,
  });
}

export default defineConfig(({ mode }: { mode: string }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000';
  const wsTarget  = env.VITE_WS_TARGET  || 'ws://localhost:3000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@iotproxy/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 5173,
      // Enable SPA fallback - serve index.html for all non-API routes
      historyApiFallback: {
        rewrites: [
          // Don't rewrite API calls, WebSocket connections, or Socket.IO
          { from: /^\/api\/.*/, to: (context: any) => context.parsedUrl.pathname },
          { from: /^\/ws\/.*/, to: (context: any) => context.parsedUrl.pathname },
          { from: /^\/socket\.io\/.*/, to: (context: any) => context.parsedUrl.pathname },
          // Rewrite everything else to index.html for client-side routing
          { from: /./, to: '/index.html' },
        ],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: (proxy) => {
            // Fresh DNS lookup + no keepAlive so Docker IP changes never get cached
            proxy.options.agent = makeFreshDnsAgent();
            proxy.on('error', (_err, _req, res) => {
              const httpRes = res as import('http').ServerResponse;
              if (!httpRes.headersSent) {
                httpRes.writeHead(503, { 'Content-Type': 'application/json' });
                httpRes.end(JSON.stringify({ message: 'Backend unavailable', error: _err?.message, stack: _err?.stack }));
              }
            });
          },
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err) => { 
              console.warn('[Vite Proxy] WebSocket error:', err.message);
            });
          },
        },
        // Socket.IO specific paths
        '/socket.io': {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (err) => { 
              console.warn('[Vite Proxy] Socket.IO error:', err.message);
            });
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log('[Vite Proxy] Socket.IO request:', req.url);
            });
          },
        },
      },
    },
  };
});

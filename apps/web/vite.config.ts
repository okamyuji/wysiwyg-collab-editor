import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { attachDraftCollab } from "@wysiwyg-collab-editor/server/draft-collab";

// Attach the collab WebSocket directly to Vite's HTTP server so the browser
// sees a same-origin /ws/draft. Cross-origin to localhost:3000 was getting
// blocked by browser shields/extensions (Brave especially), and Vite's HTTP
// proxy adds spurious ECONNRESET/EPIPE on long-lived sockets. Same-origin
// removes both classes of failure outright.
function draftCollabPlugin(): Plugin {
  return {
    name: "draft-collab",
    configureServer(server) {
      if (!server.httpServer) return;
      attachDraftCollab(server.httpServer);
      // ponytail: only log once per dev process; HMR reloads re-evaluate
      // configureServer? No — only on full restart. So this is fine.
      // eslint-disable-next-line no-console
      console.info("[draft-collab] WebSocket attached at /ws/draft");
    },
    configurePreviewServer(server) {
      if (!server.httpServer) return;
      attachDraftCollab(server.httpServer);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    draftCollabPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Service worker must not intercept the WebSocket upgrade path.
        navigateFallbackDenylist: [/^\/ws\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/documents\/.*/,
            handler: "NetworkFirst",
          },
          {
            urlPattern: /\/api\/documents\/.*\/images\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 50 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 2000, sourcemap: true, target: "es2023" },
});

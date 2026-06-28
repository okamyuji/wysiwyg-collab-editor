import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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

import { defineConfig } from 'vite';

// BASE_PATH=/troll-towers/ builds the client for a sub-path (the hub on game.martin-jensen.dk proxies /troll-towers/ to this server)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});

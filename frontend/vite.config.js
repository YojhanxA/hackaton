import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para que el build funcione en cualquier subcarpeta (GitHub Pages, Vercel, Netlify).
// En desarrollo, /api se redirige al backend local.
const API = process.env.VITE_PROXY_API || 'http://127.0.0.1:4000';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: API, changeOrigin: true } } },
  preview: { port: 4173, proxy: { '/api': { target: API, changeOrigin: true } } },
  build: { chunkSizeWarningLimit: 900 }
});

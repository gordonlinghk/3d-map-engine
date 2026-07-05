import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /<repo-name>/
  base: process.env.DEPLOY_BASE ?? '/',
  server: {
    port: 5173,
  },
});

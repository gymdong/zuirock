import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served by the NestJS server under /admin/* (plan §2.3(e)); dev proxies the API.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:3000' },
  },
});

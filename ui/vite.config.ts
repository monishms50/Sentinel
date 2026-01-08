import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Dev server configuration
  server: {
    port: 3000,
    
    // Proxy API requests to backend (fixes CORS in development)
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        // WebSocket proxy
        ws: true,
      },
    },
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
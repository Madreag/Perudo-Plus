import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: './public',
  base: '/',
  publicDir: '../assets',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@client': path.resolve(__dirname, 'src/client')
    }
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist/client-bundle',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'public/index.html')
    }
  },
  optimizeDeps: {
    include: ['three', 'howler']
  }
});

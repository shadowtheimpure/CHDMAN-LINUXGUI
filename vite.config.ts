import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Loaded from file:// inside Electron, so assets must be relative.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome140',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

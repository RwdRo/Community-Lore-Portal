import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(() => ({
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({ include: ['buffer'], globals: { Buffer: true, global: false, process: false } }),
    ],
    build: { outDir: 'dist/client' },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  }));

import { defineConfig } from 'vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/spc-player/',

  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
  ],

  resolve: {
    alias: {
      '@': '/src',
    },
  },

  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },

  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },

  worker: {
    format: 'es',
  },
});

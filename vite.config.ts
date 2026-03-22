import { existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import type { Plugin, IndexHtmlTransformResult } from 'vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { build as viteBuild } from 'vite';

/**
 * Vite plugin that builds src/sw.ts as a separate self-contained bundle.
 * The SW file is output as `sw.js` at the dist root with no content hash
 * (service workers must have a stable URL for browser update checks).
 *
 * During dev, the SW is not registered — HMR and SW don't mix well.
 */
const buildServiceWorker = (): Plugin => {
  let base = '/';
  return {
    name: 'build-service-worker',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    async closeBundle() {
      // Scan for WASM files produced by the main build so they can be precached
      const assetsDir = resolve(__dirname, 'dist/assets');
      let precacheUrls: string[] = [];
      if (existsSync(assetsDir)) {
        const wasmFiles = readdirSync(assetsDir).filter((f) =>
          f.endsWith('.wasm'),
        );
        precacheUrls = wasmFiles.map((f) => `${base}assets/${f}`);
      }

      await viteBuild({
        configFile: false,
        define: {
          __APP_VERSION__: JSON.stringify(
            process.env.npm_package_version ?? 'dev',
          ),
          __BASE_URL__: JSON.stringify(base),
          __PRECACHE_URLS__: JSON.stringify(precacheUrls),
        },
        build: {
          emptyOutDir: false,
          sourcemap: true,
          rollupOptions: {
            input: resolve(__dirname, 'src/sw.ts'),
            output: {
              entryFileNames: 'sw.js',
              dir: resolve(__dirname, 'dist'),
              format: 'iife',
            },
          },
        },
      });
    },
  };
};

/**
 * Vite plugin that injects a `<link rel="preload">` for the DSP WASM binary.
 * The WASM filename includes a content hash that is only known after bundling,
 * so we use `transformIndexHtml` with `order: 'post'` to read the bundle manifest.
 */
const wasmPreload = (): Plugin => {
  let base = '/';
  return {
    name: 'wasm-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx): IndexHtmlTransformResult {
        const bundle = ctx.bundle;
        if (!bundle) return [];

        const wasmAsset = Object.keys(bundle).find((key) =>
          key.endsWith('.wasm'),
        );
        if (!wasmAsset) return [];

        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `${base}${wasmAsset}`,
              as: 'fetch',
              crossorigin: true,
            },
            injectTo: 'head',
          },
        ];
      },
    },
  };
};

export default defineConfig({
  base: '/spc-player/',

  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },

  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    buildServiceWorker(),
    wasmPreload(),
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
          if (id.includes('node_modules/radix-ui')) {
            return 'radix-vendor';
          }
          if (id.includes('node_modules/zustand')) {
            return 'state-vendor';
          }
          if (
            id.includes('node_modules/@tanstack/react-router') ||
            id.includes('node_modules/@tanstack/zod-adapter') ||
            id.includes('node_modules/zod')
          ) {
            return 'router-vendor';
          }
          if (
            id.includes('node_modules/idb') ||
            id.includes('node_modules/fflate')
          ) {
            return 'data-vendor';
          }
          if (id.includes('node_modules/wasm-media-encoders')) {
            return 'wasm-media-encoder';
          }
          if (id.includes('node_modules/libflacjs')) {
            return 'libflac-encoder';
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/wasm-media-encoders')) {
            return 'wasm-media-encoder';
          }
          if (id.includes('node_modules/libflacjs')) {
            return 'libflac-encoder';
          }
        },
      },
    },
  },

  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});

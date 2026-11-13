import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Webview bundle. Fixed file names so the host can reference them with asWebviewUri.
 * Output is loaded as an ES module under a strict CSP (design §7.1).
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    sourcemap: false,
    rolldownOptions: {
      input: {
        sidebar: 'src/webview/sidebar/main.tsx',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});

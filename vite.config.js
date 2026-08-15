import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const extensionFiles = [
  'manifest.json',
  'offscreen.html',
  'service-worker.js',
  'audio-engine.js',
  'mastering-worklet.js',
  'goateq16.png',
  'goateq32.png',
  'goateq48.png',
  'goateq64.png',
  'goateq128.png'
];

function copyExtensionRuntime() {
  return {
    name: 'copy-extension-runtime',
    closeBundle() {
      mkdirSync(resolve('dist'), { recursive: true });
      for (const file of extensionFiles) {
        copyFileSync(resolve(file), resolve('dist', file));
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), copyExtensionRuntime()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022'
  }
});

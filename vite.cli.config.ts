import { readFileSync } from 'node:fs';

import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version?: string;
};

export default defineConfig({
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'dist/cli',
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
  },
});

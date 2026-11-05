import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two Sigma plugins in one project:
//   /            Number check   (index.html)
//   /cockpit/    Spring cockpit (cockpit/index.html)
// `npm run dev` serves both on http://localhost:3000, the Sigma Plugin Dev Playground's default URL.
// `npm run build` writes dist/ for Vercel or any static host.
// Single-file modes build one self-contained HTML page each, for sharing outside Sigma:
//   preview (Number check), cockpit-preview (cockpit), bench (test bench around Number check).
const SINGLE = {
  preview: { input: 'index.html', outDir: 'preview' },
  'cockpit-preview': { input: 'cockpit/index.html', outDir: 'cockpit-preview' },
  bench: { input: 'harness.html', outDir: 'bench' },
};
export default defineConfig(({ mode }) => {
  const single = SINGLE[mode];
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile()] : [react()],
    server: { port: 3000, strictPort: true },
    build: {
      outDir: single ? single.outDir : 'dist',
      emptyOutDir: true,
      rollupOptions: { input: single ? single.input : { main: 'index.html', cockpit: 'cockpit/index.html' } },
    },
  };
});

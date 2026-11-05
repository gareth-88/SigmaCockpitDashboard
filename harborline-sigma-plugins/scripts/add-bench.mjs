// Puts the test bench beside the plugin in the deployed site, at /bench.html.
import { copyFileSync } from 'node:fs';
copyFileSync(new URL('../bench/harness.html', import.meta.url), new URL('../dist/bench.html', import.meta.url));
console.log('dist/bench.html written');

import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// esbuild is a development-only tool. Install dev dependencies (`npm install`)
// before building; the published package already ships the generated host.js.
let build;
try {
  ({ build } = await import('esbuild'));
} catch {
  console.error('esbuild is required to build host.js: run `npm install` first.');
  process.exit(1);
}

await build({
  entryPoints: [`${here}index.js`],
  outfile: `${here}host.js`,
  platform: 'node',
  format: 'esm',
  bundle: true,
  packages: 'external',
  target: 'node22',
});

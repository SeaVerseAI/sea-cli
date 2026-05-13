import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { globSync } from 'fs';
import { dirname } from 'path';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const VERSION = process.env.VERSION ?? pkg.version;
const OUT = 'dist/sac.mjs';
const isTest = process.argv.includes('--test');
const isE2E  = process.argv.includes('--e2e');

// Ensure dist directory exists
execSync('mkdir -p dist');

// Use local esbuild if available, fall back to npx
const esbinLocal = './node_modules/.bin/esbuild';
const esbuild = existsSync(esbinLocal) ? esbinLocal : 'npx --yes esbuild';
const cjsRequireBanner = `--banner:js=${JSON.stringify("import { createRequire } from 'module';const require = createRequire(import.meta.url);")}`;

if (!isTest && !isE2E) {
  // Build main bundle
  execSync(
    `${esbuild} src/main.ts --bundle --platform=node --target=node18 --outfile=${OUT} --format=esm --minify ${cjsRequireBanner} --define:process.env.CLI_VERSION='"${VERSION}"'`,
    { stdio: 'inherit' },
  );

  const content = readFileSync(OUT);
  writeFileSync(OUT, Buffer.concat([Buffer.from('#!/usr/bin/env node\n'), content]));
  execSync(`chmod +x ${OUT}`);

  const size = (content.length / 1024).toFixed(0);
  console.log(`dist/sac.mjs  ${size}KB`);
} else if (isE2E) {
  // Build integration test bundle
  rmSync('dist/test/integration', { recursive: true, force: true });
  execSync('mkdir -p dist/test/integration');
  execSync(
    `${esbuild} test/integration/all-models.ts --bundle --platform=node --target=node18 --outfile=dist/test/integration/all-models.js --format=esm --external:node:* --external:undici`,
    { stdio: 'inherit' },
  );
  console.log('Built integration test bundle');
} else {
  // Build test files (each as its own bundle, not minified, with source maps)
  rmSync('dist/test', { recursive: true, force: true });
  const testFiles = globSync('test/**/*.test.ts');
  for (const file of testFiles) {
    const outFile = file.replace(/^test\//, 'dist/test/').replace(/\.ts$/, '.js');
    mkdirSync(dirname(outFile), { recursive: true });
    execSync(
      `${esbuild} ${file} --bundle --platform=node --target=node18 --outfile=${outFile} --format=esm --external:node:*`,
      { stdio: 'inherit' },
    );
  }
  // Also build helper
  execSync(
    `${esbuild} test/helpers/mock-server.ts --bundle --platform=node --target=node18 --outfile=dist/test/helpers/mock-server.js --format=esm --external:node:*`,
    { stdio: 'ignore' },
  );
  console.log(`Built ${testFiles.length} test files`);
}

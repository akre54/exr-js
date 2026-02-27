#!/usr/bin/env node

import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const requiredFiles = [
  'dist/exrjs.cjs',
  'dist/exrjs.esm.js',
  'dist/exrjs.browser.esm.js',
  'dist/exrjs.umd.js',
  'dist/index.d.ts',
];

let hasErrors = false;

console.log('Verifying build outputs...\n');

for (const file of requiredFiles) {
  const filePath = join(projectRoot, file);

  if (!existsSync(filePath)) {
    console.error(`❌ Missing: ${file}`);
    hasErrors = true;
  } else {
    const stats = statSync(filePath);
    console.log(`✓ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  }
}

if (hasErrors) {
  console.error('\n❌ Build verification failed!');
  process.exit(1);
}

console.log('\n✓ All required files present');

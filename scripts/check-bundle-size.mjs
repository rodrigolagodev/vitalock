#!/usr/bin/env node
/**
 * Bundle size budget gate. No dependencies on purpose.
 *
 *   node scripts/check-bundle-size.mjs apps/admin
 *
 * Reads <app>/bundle-budget.json:
 *   {
 *     "initialGzipKb": 220,   // sum of every chunk index.html loads eagerly
 *     "chunkGzipKb":   120,   // no single JS chunk above this
 *     "totalGzipKb":   600    // everything under dist/assets/*.js
 *   }
 *
 * "Initial" = the entry chunk plus the vendor-* chunks it imports, which is what
 * a cold visit pays before the first route renders. Route chunks are lazy and
 * only count against the per-chunk and total budgets.
 *
 * Exit 1 on any breach and print a table either way, so CI logs double as a
 * size history.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const appDir = resolve(process.argv[2] ?? '.');
const budgetPath = join(appDir, 'bundle-budget.json');
const assetsDir = join(appDir, 'dist', 'assets');
const indexHtml = join(appDir, 'dist', 'index.html');

if (!existsSync(budgetPath)) {
  console.error(`no bundle-budget.json in ${appDir}`);
  process.exit(2);
}
if (!existsSync(assetsDir)) {
  console.error(`no dist/assets in ${appDir} — run the build first`);
  process.exit(2);
}

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
const kb = (bytes) => bytes / 1024;
const fmt = (n) => n.toFixed(1).padStart(7);

const chunks = readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => {
    const raw = readFileSync(join(assetsDir, f));
    return { name: f, rawKb: kb(statSync(join(assetsDir, f)).size), gzipKb: kb(gzipSync(raw).length) };
  })
  .sort((a, b) => b.gzipKb - a.gzipKb);

// Eager set: everything index.html references directly (script + modulepreload).
const html = existsSync(indexHtml) ? readFileSync(indexHtml, 'utf8') : '';
const eager = new Set([...html.matchAll(/assets\/([^"']+\.js)/g)].map((m) => m[1]));

let initial = 0;
let total = 0;
const failures = [];

console.log(`\nBundle sizes — ${appDir.replace(process.cwd() + '/', '')}`);
console.log(`${'chunk'.padEnd(44)} ${'raw kB'.padStart(8)} ${'gzip kB'.padStart(8)}  eager`);
for (const c of chunks) {
  total += c.gzipKb;
  const isEager = eager.has(c.name);
  if (isEager) initial += c.gzipKb;
  if (budget.chunkGzipKb && c.gzipKb > budget.chunkGzipKb) {
    failures.push(`chunk ${c.name} is ${c.gzipKb.toFixed(1)} kB gzip > ${budget.chunkGzipKb} kB`);
  }
  console.log(`${c.name.padEnd(44)} ${fmt(c.rawKb)} ${fmt(c.gzipKb)}  ${isEager ? '●' : ''}`);
}
console.log(`\ninitial (eager) gzip: ${initial.toFixed(1)} kB  (budget ${budget.initialGzipKb ?? '—'})`);
console.log(`total gzip:           ${total.toFixed(1)} kB  (budget ${budget.totalGzipKb ?? '—'})`);

if (budget.initialGzipKb && initial > budget.initialGzipKb) {
  failures.push(`initial gzip ${initial.toFixed(1)} kB > ${budget.initialGzipKb} kB`);
}
if (budget.totalGzipKb && total > budget.totalGzipKb) {
  failures.push(`total gzip ${total.toFixed(1)} kB > ${budget.totalGzipKb} kB`);
}

if (failures.length) {
  console.error('\n✗ bundle budget exceeded:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nRaise the budget deliberately in bundle-budget.json or trim the bundle.');
  process.exit(1);
}
console.log('\n✓ within budget');

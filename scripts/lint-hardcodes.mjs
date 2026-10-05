#!/usr/bin/env node
/**
 * Hardcoded design-value gate. Plain ESM, no dependencies.
 *
 *   node scripts/lint-hardcodes.mjs                 # apps/admin/src + packages/ui/src
 *   node scripts/lint-hardcodes.mjs --root <dir>    # repeatable; replaces the defaults
 *
 * Flags raw Tailwind palette classes (`bg-blue-100`), hex colours (`text-[#a13c22]`,
 * `'#fff'`) and arbitrary px values (`w-[372px]`). Colours come from the tokens in
 * `packages/ui/globals.css`; sizes come from the Tailwind scale or a named preset token.
 *
 * Escape hatch (needs a written reason, otherwise it is itself a finding):
 *   // lint-hardcodes-ignore-next-line: <reason>
 *
 * Output: `path:line:col  rule  match`, sorted. Exit 0 clean, 1 findings, 2 bad usage.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROOTS = ['apps/admin/src', 'packages/ui/src'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', 'dist', 'build', 'coverage']);
const SKIPPED_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$|\.generated\./;

const HUES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE_UTILITIES =
  'bg|text|border(?:-[xytblrse])?|ring|ring-offset|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow';
const VARIANTS = String.raw`(?:[\w\[\]&=>*-]+:)*`;
const BOUNDARY_BEFORE = String.raw`(?<![\w-])`;

/** Each rule has one regex; `scanSource` runs it over comment-stripped code. */
export const RULES = {
  palette: new RegExp(
    `${BOUNDARY_BEFORE}${VARIANTS}(?:${PALETTE_UTILITIES})-(?:${HUES})-(?:50|100|200|300|400|500|600|700|800|900|950)(?:/\\d+)?(?![\\w-])`,
    'g',
  ),
  // `[#rgb]` style arbitrary values, or a string literal that is only a hex colour.
  hex: new RegExp(
    String.raw`${BOUNDARY_BEFORE}${VARIANTS}[a-z][\w-]*-\[#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]|(['"\`])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\1`,
    'g',
  ),
  // `utility-[value]` (optionally behind variants) whose value holds a px length.
  px: new RegExp(
    `${BOUNDARY_BEFORE}${VARIANTS}-?[a-z][\\w-]*-\\[([^\\]\\s]*\\d(?:\\.\\d+)?px[^\\]\\s]*)\\]`,
    'g',
  ),
};

/** Utility names whose bracket is a selector or a template, never a design value. */
const ALLOWED_UTILITY = /^(?:(?:group-|peer-)?data|aria|supports|grid-cols|grid-rows)$/;
const IGNORE_DIRECTIVE =
  /(?:\/\/|\/\*)\s*lint-hardcodes-ignore-next-line(?::\s*(.*?))?\s*(?:\*\/\s*\}?)?\s*$/;

/**
 * Blank out comments (keeping offsets and newlines) so a `#220` or a class name
 * mentioned in prose is never scanned. String literals are respected, so the
 * `//` in `'https://x'` is not a comment.
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote || (ch === '\n' && quote !== '`')) quote = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < text.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

function isAllowedPx(match) {
  const bracket = match.lastIndexOf('-[');
  const utility = match.slice(0, bracket).split(':').pop() ?? '';
  const value = match.slice(bracket + 2, -1);
  if (ALLOWED_UTILITY.test(utility)) return true;
  // Radix CSS variables and calc()/min()/max() expressions built on them.
  return value.startsWith('--') || value.includes('var(--');
}

function locate(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

/** @returns {{file: string, line: number, col: number, rule: string, match: string}[]} */
export function scanSource(text, file) {
  const findings = [];
  const suppressed = new Set();

  text.split('\n').forEach((raw, index) => {
    const directive = IGNORE_DIRECTIVE.exec(raw);
    if (!directive) return;
    const reason = (directive[1] ?? '').trim();
    if (reason === '') {
      findings.push({
        file,
        line: index + 1,
        col: directive.index + 1,
        rule: 'ignore-without-reason',
        match: 'lint-hardcodes-ignore-next-line',
      });
    } else {
      suppressed.add(index + 2);
    }
  });

  const code = stripComments(text);
  for (const [rule, pattern] of Object.entries(RULES)) {
    for (const hit of code.matchAll(pattern)) {
      const match = hit[0];
      if (rule === 'px' && isAllowedPx(match)) continue;
      const { line, col } = locate(code, hit.index);
      if (suppressed.has(line)) continue;
      findings.push({ file, line, col, rule, match });
    }
  }
  return sortFindings(findings);
}

function sortFindings(findings) {
  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.col - b.col ||
      a.rule.localeCompare(b.rule),
  );
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* walk(full);
    } else if (
      !SKIPPED_FILE.test(entry.name) &&
      EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))
    ) {
      yield full;
    }
  }
}

/** Throws when a root is missing or not a directory. */
export function scanRoots(roots) {
  const findings = [];
  for (const root of roots) {
    if (!statSync(root).isDirectory()) throw new Error(`not a directory: ${root}`);
    for (const file of walk(root)) {
      const shown = relative(process.cwd(), file) || file;
      findings.push(...scanSource(readFileSync(file, 'utf8'), shown));
    }
  }
  return sortFindings(findings);
}

function parseArgs(argv) {
  const roots = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--root') throw new Error(`unknown argument: ${argv[i]}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error('--root needs a directory');
    roots.push(resolve(value));
    i += 1;
  }
  return roots.length > 0 ? roots : DEFAULT_ROOTS.map((root) => resolve(root));
}

function main(argv) {
  let findings;
  try {
    findings = scanRoots(parseArgs(argv));
  } catch (error) {
    console.error(`lint-hardcodes: ${error.message}`);
    return 2;
  }
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.col}  ${f.rule}  ${f.match}`);
  if (findings.length > 0) {
    console.error(
      `lint-hardcodes: ${findings.length} finding(s). Use a token or a Tailwind scale step.`,
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

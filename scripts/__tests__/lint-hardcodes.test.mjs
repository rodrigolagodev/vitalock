import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { scanRoots, scanSource } from '../lint-hardcodes.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'lint-hardcodes.mjs');
const fixtures = join(here, '..', '__fixtures__', 'hardcodes');

/** `scanSource` wrapper: the rules hit by a snippet, in order. */
const rulesOf = (code) => scanSource(code, 'snippet.tsx').map((f) => f.rule);
const cls = (value) => `export const x = <div className="${value}" />;`;

async function cli(...args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('scanSource: flagged values', () => {
  const flagged = [
    ['bg-blue-100', 'palette'],
    ['dark:text-blue-200', 'palette'],
    ['hover:bg-red-500/50', 'palette'],
    ['border-t-gray-300', 'palette'],
    ['ring-offset-emerald-950', 'palette'],
    ['w-[372px]', 'px'],
    ['sm:max-w-[200px]', 'px'],
    ['top-[-1px]', 'px'],
    ['w-[calc(100%-8px)]', 'px'],
    ['text-[#a13c22]', 'hex'],
    ['bg-[#fff]', 'hex'],
    ['bg-[#a13c2280]', 'hex'],
  ];

  for (const [value, rule] of flagged) {
    it(`flags ${value} as ${rule}`, () => {
      assert.deepEqual(rulesOf(cls(value)), [rule]);
    });
  }

  it("flags a whole-string hex literal such as color: '#fff'", () => {
    assert.deepEqual(rulesOf("const style = { color: '#fff' };"), ['hex']);
    assert.deepEqual(rulesOf('const c = "#a13c22";'), ['hex']);
  });

  it('reports line, column and the offending text', () => {
    const [finding] = scanSource('const a = 1;\nconst b = <i className="w-[372px]" />;\n', 'f.tsx');
    assert.equal(finding.line, 2);
    assert.equal(finding.col, 25);
    assert.equal(finding.match, 'w-[372px]');
    assert.equal(finding.rule, 'px');
    assert.equal(finding.file, 'f.tsx');
  });
});

describe('scanSource: allowed values', () => {
  const allowed = [
    'data-[state=open]:bg-accent',
    'group-data-[collapsed=true]:w-16',
    'aria-[invalid=true]:border-destructive',
    'translate-x-[-50%]',
    'slide-in-from-top-[48%]',
    'grid-cols-[200px_1fr]',
    'grid-rows-[auto_1fr]',
    'w-[var(--radix-popover-trigger-width)]',
    'max-h-[--radix-select-content-available-height]',
    'w-[calc(var(--sidebar-width)+8px)]',
    'w-[50%]',
    'w-[2.5rem]',
    'bg-black/80',
    'text-white',
    'bg-info/10',
    'text-destructive',
    'h-px',
    '[&_svg]:size-4',
  ];

  for (const value of allowed) {
    it(`allows ${value}`, () => {
      assert.deepEqual(scanSource(cls(value), 'snippet.tsx'), []);
    });
  }

  it('ignores comments, so a hash in a comment is never a hex finding', () => {
    assert.deepEqual(
      scanSource('// spec #220 and bg-red-500 and w-[10px]\nconst a = 1;', 'f.ts'),
      [],
    );
    assert.deepEqual(scanSource('/* bg-red-500\n w-[10px] */\nconst a = 1;', 'f.ts'), []);
  });

  it('does not treat a URL double slash inside a string as a comment', () => {
    assert.deepEqual(rulesOf("const u = 'https://x.dev'; const c = 'bg-red-500';"), ['palette']);
  });

  it("does not flag prose such as 'Orden #123'", () => {
    assert.deepEqual(scanSource("const t = 'Orden #123';", 'f.ts'), []);
  });
});

describe('scanSource: ignore directive', () => {
  it('suppresses the next line when a reason is given', () => {
    const code = [
      '// lint-hardcodes-ignore-next-line: vendor badge mandated by the brand guide',
      cls('bg-blue-100'),
    ].join('\n');
    assert.deepEqual(scanSource(code, 'f.tsx'), []);
  });

  it('only suppresses the line right after the directive', () => {
    const code = [
      '// lint-hardcodes-ignore-next-line: reason',
      cls('bg-blue-100'),
      cls('bg-red-500'),
    ].join('\n');
    const findings = scanSource(code, 'f.tsx');
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 3);
  });

  it('reports ignore-without-reason and does not suppress when the reason is empty', () => {
    const code = ['// lint-hardcodes-ignore-next-line', cls('bg-blue-100')].join('\n');
    assert.deepEqual(rulesOf(code).sort(), ['ignore-without-reason', 'palette']);
    const blank = ['// lint-hardcodes-ignore-next-line:   ', cls('bg-blue-100')].join('\n');
    assert.deepEqual(rulesOf(blank).sort(), ['ignore-without-reason', 'palette']);
  });
});

describe('scanRoots', () => {
  it('skips test files, __tests__ folders and declaration files', () => {
    const findings = scanRoots([join(fixtures, 'bad')]);
    const files = new Set(findings.map((f) => f.file.split('/').pop()));
    assert.deepEqual([...files].sort(), ['hex.tsx', 'palette.tsx', 'px.tsx']);
  });
});

describe('CLI', () => {
  it('exits 1 on the bad fixture and prints each seeded finding as path:line:col  rule  match', async () => {
    const { code, stdout } = await cli('--root', join(fixtures, 'bad'));
    assert.equal(code, 1);
    const lines = stdout.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[0], /bad\/hex\.tsx:2:\d+ {2}hex {2}text-\[#a13c22\]$/);
    assert.match(lines[1], /bad\/palette\.tsx:2:\d+ {2}palette {2}bg-blue-100$/);
    assert.match(lines[2], /bad\/px\.tsx:2:\d+ {2}px {2}w-\[372px\]$/);
  });

  it('proves each rule on its own fixture: exactly one finding of the matching rule', async () => {
    for (const [file, rule] of [
      ['palette.tsx', 'palette'],
      ['hex.tsx', 'hex'],
      ['px.tsx', 'px'],
    ]) {
      const findings = scanRoots([join(fixtures, 'bad')]).filter((f) => f.file.endsWith(file));
      assert.equal(findings.length, 1, file);
      assert.equal(findings[0].rule, rule, file);
    }
  });

  it('exits 0 with no output on the clean fixture', async () => {
    const { code, stdout } = await cli('--root', join(fixtures, 'clean'));
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });

  it('exits 0 on the allowlisted-only fixture', async () => {
    const { code, stdout } = await cli('--root', join(fixtures, 'allowlisted'));
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });

  it('honours an ignore directive with a reason (exit 0) and fails without one (exit 1)', async () => {
    assert.equal((await cli('--root', join(fixtures, 'ignored'))).code, 0);
    const bare = await cli('--root', join(fixtures, 'ignore-no-reason'));
    assert.equal(bare.code, 1);
    assert.match(bare.stdout, /ignore-without-reason/);
  });

  it('accepts --root more than once and aggregates findings', async () => {
    const { code, stdout } = await cli(
      '--root',
      join(fixtures, 'bad'),
      '--root',
      join(fixtures, 'clean'),
    );
    assert.equal(code, 1);
    assert.equal(stdout.trim().split('\n').length, 3);
  });

  it('exits 2 on unknown arguments, a missing --root value or an unreadable root', async () => {
    assert.equal((await cli('--nope')).code, 2);
    assert.equal((await cli('--root')).code, 2);
    assert.equal((await cli('--root', join(fixtures, 'does-not-exist'))).code, 2);
  });
});

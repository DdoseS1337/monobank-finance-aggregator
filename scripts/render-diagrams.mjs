#!/usr/bin/env node
/**
 * Extract every ```mermaid``` block from docs/diagrams/*.md and render it
 * via @mermaid-js/mermaid-cli (mmdc). One file per block; numbered suffix
 * when a single doc has several diagrams.
 *
 * Outputs land in docs/diagrams/rendered/ — gitignored binary, regenerated
 * on demand. Two formats produced by default:
 *
 *   .svg  — vector. Use this in DOCX/Word (Insert → Picture) and PDFs:
 *           infinitely zoomable, no blur. Best for thesis appendices.
 *   .png  — high-DPI raster, 2400px wide @ scale=2. Use in slides /
 *           markdown previews where SVG isn't supported.
 *
 * Usage:
 *   npm install -g @mermaid-js/mermaid-cli          # one-time
 *   node scripts/render-diagrams.mjs                # all → svg + png
 *   node scripts/render-diagrams.mjs --format svg   # svg only (faster)
 *   node scripts/render-diagrams.mjs --format png   # png only
 *   node scripts/render-diagrams.mjs 03-c4-*.md     # only matching docs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'docs', 'diagrams');
const OUT = resolve(SRC, 'rendered');

function extractBlocks(content) {
  const blocks = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) blocks.push(m[1]);
  return blocks;
}

function which(cmd) {
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      encoding: 'utf8',
    })
      .split(/\r?\n/)[0]
      .trim();
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = { formats: ['svg', 'png'], filters: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') {
      const v = argv[++i];
      out.formats = v === 'both' ? ['svg', 'png'] : [v];
    } else {
      out.filters.push(a);
    }
  }
  return out;
}

function renderOne({ tmp, outPath, format }) {
  // Larger width for sequence diagrams that get too dense at default size.
  // -s 2 doubles the bitmap density for PNG; SVG ignores it but is vector.
  const args = ['-i', tmp, '-o', outPath, '-b', 'white'];
  if (format === 'png') {
    args.push('-w', '2400', '-s', '2');
  }
  execFileSync('mmdc', args, {
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

function main() {
  if (!which('mmdc')) {
    console.error(
      'mmdc not found. Install once:\n  npm install -g @mermaid-js/mermaid-cli',
    );
    process.exit(1);
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const { formats, filters } = parseArgs(process.argv.slice(2));
  const files = readdirSync(SRC)
    .filter((f) => f.endsWith('.md'))
    .filter((f) =>
      filters.length === 0
        ? true
        : filters.some((p) => new RegExp(p.replace('*', '.*')).test(f)),
    );

  let totalDiagrams = 0;
  for (const file of files) {
    const stem = basename(file, extname(file));
    const content = readFileSync(resolve(SRC, file), 'utf8');
    const blocks = extractBlocks(content);
    if (blocks.length === 0) {
      console.log(`  ${file}: no mermaid blocks`);
      continue;
    }
    blocks.forEach((src, i) => {
      const tmp = resolve(tmpdir(), `${stem}-${i + 1}-${Date.now()}.mmd`);
      writeFileSync(tmp, src, 'utf8');
      const baseStem = blocks.length === 1 ? stem : `${stem}-${i + 1}`;

      const successes = [];
      const failures = [];
      for (const format of formats) {
        const outPath = resolve(OUT, `${baseStem}.${format}`);
        try {
          renderOne({ tmp, outPath, format });
          successes.push(format);
        } catch (err) {
          failures.push({
            format,
            msg: (err.stderr || err.message || '').toString().slice(0, 200),
          });
        }
      }
      rmSync(tmp, { force: true });

      if (successes.length > 0) {
        totalDiagrams++;
        console.log(
          `  ${file} #${i + 1} → ${baseStem}.{${successes.join(',')}}`,
        );
      }
      for (const f of failures) {
        console.error(`  ${file} #${i + 1} [${f.format}]: ${f.msg}`);
      }
    });
  }
  console.log(`\nDone. Rendered ${totalDiagrams} diagrams into ${OUT}`);
}

main();

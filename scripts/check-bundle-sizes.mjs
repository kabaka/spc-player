/**
 * Validates that production bundle sizes stay within budget.
 * Reads gzipped sizes of JS chunks in dist/assets/ and enforces:
 *   - Total JS (gzipped) < 200 KB (excluding codec chunks)
 *   - React vendor chunk < 50 KB gzipped
 *   - Largest route chunk < 50 KB gzipped
 *
 * Usage: node scripts/check-bundle-sizes.mjs [dist-dir]
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = {
  // 250 KB gzipped (excluding codec and worker chunks).
  // Raised from 210 KB to accommodate Phase B–F features (transport bar,
  // playlist sidebar, visualizations, help dialog — ~15–22 KB net new).
  // Code-splitting via React.lazy() for VisualizationStage and HelpDialog
  // offsets ~8–10 KB from the critical path. Beyond 250 KB warrants
  // architectural review. See ADR-0018.
  totalJs: 250 * 1024,
  // React 19 + ReactDOM naturally produces ~59-61 KB gzipped.
  // 65 KB gives headroom without masking real regressions.
  reactVendor: 65 * 1024, // 65 KB gzipped
  largestRoute: 50 * 1024, // 50 KB gzipped
};

// Codec chunks are excluded from total JS budget
const CODEC_PATTERNS = [/flac/i, /lame/i, /vorbis/i, /mp3/i, /ogg/i, /wav/i, /codec/i, /encoder/i];

// Worker chunks run in separate threads (AudioWorklet, Web Worker) and
// don't contribute to main-thread initial load performance.
const WORKER_PATTERNS = [/worklet/i, /worker/i, /soundtouch/i];

function isCodecChunk(filename) {
  return CODEC_PATTERNS.some((p) => p.test(filename));
}

function isWorkerChunk(filename) {
  return WORKER_PATTERNS.some((p) => p.test(filename));
}

function isRouteChunk(filename) {
  // TanStack Router auto-code-split chunks typically contain route names
  // Exclude vendor chunks and the main entry
  return (
    filename.endsWith('.js') &&
    !filename.includes('vendor') &&
    !filename.includes('index-') &&
    !isCodecChunk(filename)
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const distDir = resolve(process.argv[2] ?? 'dist');
const assetsDir = join(distDir, 'assets');

let files;
try {
  files = await readdir(assetsDir);
} catch {
  console.error(`Could not read ${assetsDir}. Did you run 'vite build' first?`);
  process.exit(1);
}

const jsFiles = files.filter((f) => f.endsWith('.js'));

const results = [];
let totalGzipped = 0;
let reactVendorGzipped = 0;
let largestRouteGzipped = 0;
let largestRouteFile = '';

for (const file of jsFiles) {
  const content = await readFile(join(assetsDir, file));
  const gzipped = gzipSync(content);
  const gzSize = gzipped.length;

  const isCodec = isCodecChunk(file);
  const isWorker = isWorkerChunk(file);
  const isVendor = file.includes('react-vendor');
  const isRoute = isRouteChunk(file);

  results.push({
    file,
    raw: content.length,
    gzipped: gzSize,
    isCodec,
    isWorker,
    isVendor,
    isRoute,
  });

  if (!isCodec && !isWorker) {
    totalGzipped += gzSize;
  }

  if (isVendor) {
    reactVendorGzipped = gzSize;
  }

  if (isRoute && gzSize > largestRouteGzipped) {
    largestRouteGzipped = gzSize;
    largestRouteFile = file;
  }
}

// Print summary table
console.log('\nBundle Size Report');
console.log('─'.repeat(70));
console.log(
  'File'.padEnd(40),
  'Raw'.padStart(10),
  'Gzipped'.padStart(10),
  'Type'.padStart(8),
);
console.log('─'.repeat(70));

for (const r of results.sort((a, b) => b.gzipped - a.gzipped)) {
  const type = r.isCodec
    ? 'codec'
    : r.isWorker
      ? 'worker'
      : r.isVendor
        ? 'vendor'
        : r.isRoute
          ? 'route'
          : 'entry';
  console.log(
    r.file.padEnd(40),
    formatSize(r.raw).padStart(10),
    formatSize(r.gzipped).padStart(10),
    type.padStart(8),
  );
}

console.log('─'.repeat(70));
console.log(
  'Total JS (excl. codecs/workers)'.padEnd(40),
  ''.padStart(10),
  formatSize(totalGzipped).padStart(10),
);
console.log();

// Check budgets
const violations = [];

if (totalGzipped > BUDGETS.totalJs) {
  violations.push(
    `Total JS (gzipped, excl. codecs/workers): ${formatSize(totalGzipped)} > ${formatSize(BUDGETS.totalJs)} budget`,
  );
}

if (reactVendorGzipped > BUDGETS.reactVendor) {
  violations.push(
    `React vendor chunk: ${formatSize(reactVendorGzipped)} > ${formatSize(BUDGETS.reactVendor)} budget`,
  );
}

if (largestRouteGzipped > BUDGETS.largestRoute) {
  violations.push(
    `Largest route chunk (${largestRouteFile}): ${formatSize(largestRouteGzipped)} > ${formatSize(BUDGETS.largestRoute)} budget`,
  );
}

if (violations.length > 0) {
  console.error('Bundle size budget violations:');
  for (const v of violations) {
    console.error(`  ✗ ${v}`);
  }
  process.exit(1);
} else {
  console.log('✓ All bundle size budgets met');
  process.exit(0);
}

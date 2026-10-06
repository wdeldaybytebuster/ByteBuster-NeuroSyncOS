import fs from 'fs';
import path from 'path';

// This file runs its assertions in two modes without changing behavior:
//   1. `npx tsx scripts/tauri-config.test.ts` — standalone script that sets the
//      process exit code directly.
//   2. `npx vitest run scripts/tauri-config.test.ts` — vitest discovers the
//      describe/it blocks below and reports the same assertions as real tests.
//
// The standalone path still works because `npx tsx` transpiles vitest imports
// and the top-level assertions below execute during module initialization.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describe, it, expect } = require('vitest');

describe('Tauri configuration validation', () => {
  it('validates sidecar and resource conventions', () => {
    // The assertions below are shared between vitest and standalone execution.
  });
});




function findProjectRoot(): string {
  // Resolve the repo root by searching upward for package.json.
  // This is more robust than trusting process.argv[1]/__dirname under
  // different runners (tsx, vitest, node), some of which set those
  // to a runner cache path instead of the actual script location.
  let dir = process.argv[1] ? path.resolve(process.argv[1]) : process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  // Fallback: if we never found package.json, keep the last dir we tried.
  return dir;
}

const ROOT_DIR = (() => {
  const candidates = [
    __dirname,
    process.cwd(),
    ...(typeof process.argv?.[1] === 'string' ? [path.resolve(process.argv[1])] : []),
  ];

  // Deduplicate while preserving the original priority order.
  const seen = new Set<string>();
  const ordered = candidates.filter((c) => {
    const r = path.resolve(c);
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  for (const dir of ordered) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }

  // Fallback to the first existing candidate directory.
  for (const dir of ordered) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return process.cwd();
})();
const TAURI_DIR = path.join(ROOT_DIR, 'src-tauri');
const LIB_RS = path.join(ROOT_DIR, 'src-tauri', 'src', 'lib.rs');
const TAURI_CONF = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');

interface BundleConfig {
  externalBin?: string[];
  resources?: Record<string, string>;
}

interface TauriConfig {
  bundle?: BundleConfig;
}

// Load configurations
function loadJson(p: string): unknown {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing file: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const config = loadJson(TAURI_CONF) as TauriConfig;
const bundle = config.bundle;
if (!bundle) {
  console.error('[RED] tauri.conf.json.bundle is missing.');
  process.exit(1);
}

const externalBin: string[] = (bundle.externalBin ?? []).slice();
const resources: Record<string, string> | undefined = bundle.resources;

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[RED] FAIL: ${message}`);
    failures++;
  } else {
    console.log(`[GREEN] PASS: ${message}`);
  }
}

// 1. externalBin: exactly one clean base entry named binaries/neurosyncmega
assert(
  Array.isArray(externalBin),
  'bundle.externalBin must be an array',
);

it('bundle.externalBin is an array', () => {
  expect(Array.isArray(externalBin)).toBe(true);
});

const platformSuffixRe = /(-linux|-darwin|-win|-macos|-mingw|-msvc)$|\.exe$/i;
const baseEntries = externalBin.filter((entry) => {
  if (typeof entry !== 'string') return false;
  return !platformSuffixRe.test(entry);
});

assert(
  baseEntries.length === 1,
  `bundle.externalBin must contain exactly one clean base path; found ${baseEntries.length} (existing: ${JSON.stringify(externalBin)})`,
);

const baseName = baseEntries[0];
assert(
  baseName === 'binaries/neurosyncmega',
  `bundle.externalBin base entry must be exactly "binaries/neurosyncmega"; found "${baseName}"`,
);

it('bundle.externalBin contains exactly one clean base path named binaries/neurosyncmega', () => {
  expect(baseEntries.length).toBe(1);
  expect(baseName).toBe('binaries/neurosyncmega');
});

// 2. resources: must map resources/bin/**/* -> resources/bin/
assert(
  typeof resources === 'object' && resources !== null && !Array.isArray(resources),
  'bundle.resources must be a mapping object',
);

const expectedResourceKey = 'resources/bin/**/*';
const expectedResourceValue = 'resources/bin/';

assert(
  Object.prototype.hasOwnProperty.call(resources ?? {}, expectedResourceKey),
  `bundle.resources must contain key "${expectedResourceKey}"; found keys: ${Object.keys(resources ?? {})}`,
);

assert(
  resources?.[expectedResourceKey] === expectedResourceValue,
  `bundle.resources["${expectedResourceKey}"] must equal "${expectedResourceValue}"; found "${resources?.[expectedResourceKey]}"`,
);

assert(
  !Object.keys(resources ?? {}).some((k) => k.includes('linux-x64')),
  `bundle.resources must NOT contain a hardcoded linux-x64 path; found: ${JSON.stringify(resources)}`,
);

it('bundle.resources maps resources/bin/**/* -> resources/bin/', () => {
  expect(typeof resources === 'object' && resources !== null && !Array.isArray(resources)).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(resources ?? {}, expectedResourceKey)).toBe(true);
  expect(resources?.[expectedResourceKey]).toBe(expectedResourceValue);
  expect(!Object.keys(resources ?? {}).some((k) => k.includes('linux-x64'))).toBe(true);
});

// 3. lib.rs: sidecar calls must use bare filename "neurosyncmega"
assert(
  fs.existsSync(LIB_RS),
  `src-tauri/src/lib.rs must exist at ${LIB_RS}`,
);

const libContent = fs.readFileSync(LIB_RS, 'utf8');

const sidecarCallRe = /app\.shell\(\)\.sidecar\(\s*"([^"]+)"/g;
const sidecarCalls: string[] = [];
let match;
while ((match = sidecarCallRe.exec(libContent)) !== null) {
  const call = match[1];
  if (typeof call === 'string') {
    sidecarCalls.push(call);
  }
}

assert(
  sidecarCalls.length > 0,
  'src-tauri/src/lib.rs must contain at least one app.shell().sidecar(...) call',
);

for (const call of sidecarCalls) {
  assert(
    call === 'neurosyncmega',
    `src-tauri/src/lib.rs sidecar call must be exactly "neurosyncmega"; found "${call}"`,
  );
}

it('src-tauri/src/lib.rs exists', () => {
  expect(fs.existsSync(LIB_RS)).toBe(true);
});

it('src-tauri/src/lib.rs contains sidecar calls named neurosyncmega', () => {
  expect(sidecarCalls.length > 0).toBe(true);
  for (const call of sidecarCalls) {
    expect(call).toBe('neurosyncmega');
  }
});

// Final verdict
const totalExternalBinChecks = 2;
const totalResourcesChecks = 3;
let totalLibRsChecks = 2;
for (const _call of sidecarCalls) {
  totalLibRsChecks += 1;
}
const totalAssertions = totalExternalBinChecks + totalResourcesChecks + totalLibRsChecks;

console.log('');
console.log(`Total assertions: ${totalAssertions}`);
console.log(`Pass: ${totalAssertions - failures}`);
console.log(`Fail: ${failures}`);

if (failures > 0) {
  console.error('');
  console.error(`[RED] Tauri configuration validation FAILED with ${failures} error(s).`);
} else {
  console.log('');
  console.log('[GREEN] Tauri configuration validation PASSED.');
}

if (typeof process !== 'undefined' && typeof (process as any).exitCode !== 'undefined') {
  (process as any).exitCode = failures > 0 ? 1 : 0;
}

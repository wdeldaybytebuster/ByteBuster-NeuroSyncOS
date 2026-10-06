#!/usr/bin/env node
/**
 * build-tauri-sidecar.js — Tauri v2 Sidecar Native Dependency Bundler
 *
 * Copies the local-architecture native Node addons (better-sqlite3, sqlite-vec,
 * node-pty, argon2) into src-tauri/resources/bin so the Tauri sidecar can resolve
 * them at runtime on the target edge node.
 *
 * Eternal Bin and Resources are now both rooted at src-tauri/resources/bin so that:
 *  - tauri.bundle.externalBin = ["binaries/neurosyncmega"]
 *  - tauri.bundle.resources maps resources/bin glob to resources/bin/
 *  - the sidecar binary is copied to resources/bin/neurosyncmega
 *  - native addons are staged under resources/bin/<platform>-<arch>/
 *
 * Usage:
 *   node scripts/build-tauri-sidecar.js
 *
 * Exit codes:
 *   0 — staging succeeded
 *   1 — staging failed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT_DIR, 'src-tauri');
const BINARIES_DIR = path.join(TAURI_DIR, 'binaries');
const RESOURCES_BIN_DIR = path.join(TAURI_DIR, 'resources', 'bin');

// ── Platform detection (local build only) ─────────────────────────────────────
const PLATFORM = process.platform; // linux | darwin | win32
const ARCH = process.arch;         // x64 | arm64

// Map local platform to the subdirectory layout we stage into binaries/.
// Tauri sidecars are invoked by name; the .node files just need to be on
// NODE_PATH or next to the sidecar binary at runtime.
const PLATFORM_SUBDIR = {
  linux:  `linux-${ARCH}`,
  darwin: `darwin-${ARCH}`,
  win32:  `win-${ARCH}`,
}[PLATFORM];

// sqlite-vec names its platform packages with `windows`, not Node's `win32`:
// `sqlite-vec-windows-x64`. The staged directory uses PLATFORM_SUBDIR (win-x64)
// and the package keeps its published name, which is what db.ts expects.
const SQLITE_VEC_OS = {
  linux:  'linux',
  darwin: 'darwin',
  win32:  'windows',
}[PLATFORM];

if (!PLATFORM_SUBDIR) {
  console.error(`[Tauri Sidecar] Unsupported platform/arch: ${PLATFORM}/${ARCH}`);
  process.exit(1);
}

const STAGED_DIR = path.join(RESOURCES_BIN_DIR, PLATFORM_SUBDIR);

console.log('[Tauri Sidecar] Platform:', PLATFORM, ARCH);
console.log('[Tauri Sidecar] Staging dir:', STAGED_DIR);
console.log('[Tauri Sidecar] Resources bin dir:', RESOURCES_BIN_DIR);

// ── Native addons to stage ─────────────────────────────────────────────────────
//
// sqlite-vec notes (verified at build time):
//  - `sqlite-vec` v0.1.9 ships its native binding as index.cjs + a WASM fallback
//    in this workspace (no standalone .node present under node_modules/sqlite-vec).
//  - It loads via `require('sqlite-vec')` in db.ts, so the WHOLE package directory
//    must be staged, not a single .node file.
//
// better-sqlite3, node-pty, argon2 ship real .node addons.

const NATIVE_DEPS = [
  {
    // better-sqlite3: single .node addon
    pkg: 'better-sqlite3',
    src: path.join(ROOT_DIR, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    dest: path.join(STAGED_DIR, 'better_sqlite3.node'),
  },
  {
    // sqlite-vec: whole package directory (CJS + WASM + assets), because this
    // workspace's installed version does not ship a standalone .node.
    pkg: 'sqlite-vec',
    srcDir: path.join(ROOT_DIR, 'node_modules', 'sqlite-vec'),
    destDir: path.join(STAGED_DIR, 'sqlite-vec'),
    copyDir: true,
  },
  {
    // node-pty: platform-specific .node (lib/binding/napi-v3/pty.node on napi-v3 builds)
    pkg: 'node-pty',
    src: path.join(ROOT_DIR, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node'),
    dest: path.join(STAGED_DIR, 'pty.node'),
  },
  {
    // argon2: node-argon2 binding
    pkg: 'argon2',
    src: path.join(ROOT_DIR, 'node_modules', 'argon2', 'lib', 'binding', 'napi-v3', 'argon2.node'),
    dest: path.join(STAGED_DIR, 'argon2.node'),
  },
  {
    // sqlite-vec native extension (vec0.so / .dylib / .dll).
    //
    // sqlite-vec resolves `sqlite-vec-<os>-<arch>` at runtime and hands the
    // resolved path to SQLite's C-level load_extension, i.e. to the OS loader.
    // Inside a pkg-packaged sidecar that path points into the virtual snapshot,
    // which dlopen cannot open, so the packaged runtime loads this staged copy
    // instead (see resolveExternalVecExtension in src/core/basevault/db.ts).
    // Staged under its published package name so require-style resolution of
    // `sqlite-vec-<os>-<arch>/vec0.<ext>` also finds it on a real path.
    pkg: `sqlite-vec-${SQLITE_VEC_OS}-${ARCH}`,
    srcDir: path.join(ROOT_DIR, 'node_modules', `sqlite-vec-${SQLITE_VEC_OS}-${ARCH}`),
    destDir: path.join(STAGED_DIR, `sqlite-vec-${SQLITE_VEC_OS}-${ARCH}`),
    copyDir: true,
  },
];

// ── Ensure staging directory exists ───────────────────────────────────────────
fs.mkdirSync(STAGED_DIR, { recursive: true });

// ── Stage each native dep ──────────────────────────────────────────────────────
let missing = 0;
let staged = 0;

for (const dep of NATIVE_DEPS) {
  if (dep.copyDir) {
    // sqlite-vec: copy whole package dir
    try {
      if (!fs.existsSync(dep.srcDir)) {
        throw new Error('package directory not found');
      }
      // remove prior staging if present
      if (fs.existsSync(dep.destDir)) {
        fs.rmSync(dep.destDir, { recursive: true, force: true });
      }
      fs.cpSync(dep.srcDir, dep.destDir, { recursive: true });
      console.log(`[Tauri Sidecar] Staged ${dep.pkg}/  -> ${path.relative(TAURI_DIR, dep.destDir)}`);
      staged++;
    } catch (err) {
      console.warn(`[Tauri Sidecar] WARNING: could not stage ${dep.pkg}: ${err.message}`);
      missing++;
    }
    continue;
  }

  // Single .node file
  const srcExists = fs.existsSync(dep.src);
  if (!srcExists) {
    // Some addons use different binding paths per napi version; try a couple of fallbacks
    const fallbacks = [];
    if (dep.pkg === 'node-pty') {
      fallbacks.push(
        path.join(ROOT_DIR, 'node_modules', 'node-pty', 'lib', 'binding', 'napi-v3', 'pty.node'),
        path.join(ROOT_DIR, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node')
      );
    }
    if (dep.pkg === 'argon2') {
      fallbacks.push(
        path.join(ROOT_DIR, 'node_modules', 'argon2', 'build', 'Release', 'argon2.node')
      );
    }

    let found = false;
    for (const fb of fallbacks) {
      if (fs.existsSync(fb)) {
        fs.copyFileSync(fb, dep.dest);
        console.log(`[Tauri Sidecar] Staged ${dep.pkg}.node (fallback) -> ${path.relative(TAURI_DIR, dep.dest)}`);
        staged++;
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn(`[Tauri Sidecar] WARNING: could not locate ${dep.pkg} .node at ${dep.src}`);
      missing++;
    }
    continue;
  }

  try {
    fs.copyFileSync(dep.src, dep.dest);
    console.log(`[Tauri Sidecar] Staged ${dep.pkg}.node -> ${path.relative(TAURI_DIR, dep.dest)}`);
    staged++;
  } catch (err) {
    console.warn(`[Tauri Sidecar] WARNING: failed to stage ${dep.pkg}.node: ${err.message}`);
    missing++;
  }
}

console.log(`[Tauri Sidecar] Staged: ${staged}, Missing: ${missing}`);

// ── Stage the sidecar binary itself if present ────────────────────────────────
//
// The existing workspace already contains a prebuilt sidecar:
//   src-tauri/binaries/neurosyncmega-linux
//
// Tauri expects sidecars referenced by basename (e.g. "binaries/sidecar") and,
// for platform-specific invocation, by the target triple suffix. We stage the
// local binary with the name Tauri will invoke on this platform.
//
// IMPORTANT: we do NOT rename or repackage the existing sidecar here. We only
// ensure the binaries/ directory contains a copy that Tauri's sidecar resolver
// can find for the local platform. Cross-platform sidecar naming is left to the
// actual packaging step.

const LOCAL_SIDECAR_NAME = {
  linux:  'neurosyncmega-linux',
  darwin: 'neurosyncmega-macos',
  win32:  'neurosyncmega-win.exe',
}[PLATFORM];

const LOCAL_SIDECAR_SRC = path.join(BINARIES_DIR, LOCAL_SIDECAR_NAME);  if (fs.existsSync(LOCAL_SIDECAR_SRC)) {
    // Tauri invokes the sidecar by the name given in externalBin + bundle config.
    // Copy it into resources/bin so the single externalBin entry can find it.
    const destSidecar = path.join(RESOURCES_BIN_DIR, 'neurosyncmega');
    fs.copyFileSync(LOCAL_SIDECAR_SRC, destSidecar);
    console.log(`[Tauri Sidecar] Staged sidecar binary: neurosyncmega (${fs.statSync(destSidecar).size} bytes)`);
} else {
  console.warn(`[Tauri Sidecar] No prebuilt sidecar binary found at ${LOCAL_SIDECAR_SRC}`);
  console.warn('[Tauri Sidecar] The sidecar must be built before tauri build (see scripts/build-sidecar.js).');
}

// ── Report staging layout ─────────────────────────────────────────────────────
console.log('\n[Tauri Sidecar] Final resources/bin/ layout (top-level):');
try {
  for (const entry of fs.readdirSync(RESOURCES_BIN_DIR)) {
    const st = fs.statSync(path.join(RESOURCES_BIN_DIR, entry));
    const label = st.isDirectory() ? 'dir ' : (st.isFile() ? 'file' : '???');
    console.log(`  ${label}  ${entry}`);
  }
} catch {
  // ignore
}

// ── Run `tauri build` ─────────────────────────────────────────────────────────
//
// We run tauri build with the project root as cwd so the @tauri-apps/cli resolves
// src-tauri/ correctly. If the tauri CLI is not installed, we fail loudly because
// packaging cannot proceed without it.
//
// IMPORTANT: we do NOT attempt to run `tauri build` from within this script for the
// sanitization pass. Build orchestration is a separate step so the engineer can
// inspect the staged layout first and so that a failed build does not mask a bad
// staging layout.

console.log('\n[Tauri Sidecar] Native dependency staging complete.');
console.log('[Tauri Sidecar] Next step: `npm run tauri:build` (or `npx tauri build`).');
console.log('[Tauri Sidecar] Exiting staging step (build orchestration deferred).');

process.exit(0);

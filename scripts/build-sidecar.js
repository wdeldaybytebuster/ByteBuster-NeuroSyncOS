const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT_DIR, 'src-tauri');
const BINARIES_DIR = path.join(TAURI_DIR, 'binaries');
const RESOURCES_BIN_DIR = path.join(TAURI_DIR, 'resources', 'bin');

const NATIVE_DEPS = [
  { pkg: 'better-sqlite3', file: 'better_sqlite3.node', srcDir: 'build/Release' },
  { pkg: 'sqlite-vec', file: 'sqlite-vec.node', srcDir: 'prebuilds/linux-x64' }, // Simplified example
  { pkg: 'node-pty', file: 'pty.node', srcDir: 'build/Release' },
  { pkg: 'argon2', file: 'argon2.node', srcDir: 'lib/binding/napi-v3' }
];

console.log('[Sidecar Build] Starting...');

// Ensure output directories exist
if (!fs.existsSync(BINARIES_DIR)) {
  fs.mkdirSync(BINARIES_DIR, { recursive: true });
}
if (!fs.existsSync(RESOURCES_BIN_DIR)) {
  fs.mkdirSync(RESOURCES_BIN_DIR, { recursive: true });
}

// 0. Pre-bundle the TypeScript server entry into a single CommonJS file.
//
// pkg cannot consume TypeScript: it snapshots the .ts sources verbatim and the
// resulting binary aborts on first import with
// "SyntaxError: Cannot use import statement outside a module". Bundling to JS
// first gives pkg a real JavaScript entry point.
//
// Native addons are marked external so they stay real `require()` calls: pkg
// then walks them from node_modules into the snapshot instead of esbuild
// trying (and failing) to inline a .node binary.
//
// esbuild `--target` matches the Node runtime pkg actually embeds. This is not
// cosmetic: the embedded runtime's NODE_MODULE_VERSION must equal the ABI the
// native addons in node_modules were compiled for, or better-sqlite3 aborts
// with ERR_DLOPEN_FAILED. The workspace toolchain is Node 20, so both the
// esbuild target and the pkg targets below are node20.
const SERVER_BUNDLE = path.join(ROOT_DIR, 'dist', 'server.cjs');
const ESBUILD_EXTERNALS = [
  'better-sqlite3',
  'node-pty',
  'argon2',
  'sqlite-vec',
  'node-llama-cpp',
  'poolifier',
  'esbuild',
].map((pkgName) => `--external:${pkgName}`).join(' ');

console.log('[Sidecar Build] Pre-bundling src/server/index.ts with esbuild...');
try {
  execSync(
    `npx esbuild src/server/index.ts --bundle --platform=node --target=node20 --format=cjs ` +
    `--outfile="${SERVER_BUNDLE}" ${ESBUILD_EXTERNALS}`,
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );
  console.log(`[Sidecar Build] Bundled server entry -> ${path.relative(ROOT_DIR, SERVER_BUNDLE)}`);
} catch (e) {
  console.error('[Sidecar Build] esbuild pre-bundle failed:', e.message);
  process.exit(1);
}

// 1. Run pkg to generate binaries
//
// pkg is invoked in directory mode (`.`) on purpose: the package.json `pkg`
// config (native-addon assets) is only resolved this way. Passing the bundle
// file directly silently drops the assets, and the binary then dies at runtime
// with "Could not locate the bindings file". `package.json.bin` points at the
// bundled JS entry produced above.
console.log('[Sidecar Build] Compiling Node.js binary with pkg...');
try {
  // Map standard pkg targets to Tauri target triples
  execSync('npx pkg . --target node20-linux-x64,node20-macos-x64,node20-win-x64 --out-path src-tauri/binaries', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
} catch (e) {
  console.error('[Sidecar Build] pkg compilation failed:', e.message);
  process.exit(1);
}

// Tauri expects sidecar binaries to have the target triple suffix.
// pkg outputs files like: neurosyncmega-linux, neurosyncmega-macos, neurosyncmega-win.exe
// bundle.externalBin declares the base path "binaries/neurosyncmega", so the CLI
// resolves the on-disk artifact as <base>-<target-triple>. We must therefore emit:
// neurosyncmega-x86_64-unknown-linux-gnu, neurosyncmega-x86_64-apple-darwin,
// neurosyncmega-x86_64-pc-windows-msvc.exe

const renameMap = {
  'neurosyncmega-linux': 'neurosyncmega-x86_64-unknown-linux-gnu',
  'neurosyncmega-macos': 'neurosyncmega-x86_64-apple-darwin',
  'neurosyncmega-win.exe': 'neurosyncmega-x86_64-pc-windows-msvc.exe'
};

for (const [src, dest] of Object.entries(renameMap)) {
  const srcPath = path.join(BINARIES_DIR, src);
  const destPath = path.join(BINARIES_DIR, dest);
  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
    console.log(`[Sidecar Build] Renamed ${src} to ${dest}`);
  }
}

// 2. Extract Native C-Extensions
console.log('[Sidecar Build] Copying native C-extensions to resources/bin...');
let missingDeps = 0;

for (const dep of NATIVE_DEPS) {
  const potentialPaths = [
    path.join(ROOT_DIR, 'node_modules', dep.pkg, dep.srcDir, dep.file),
    // Some packages dynamically select bindings based on platform. 
    // For a real production build you'd map triples accurately, but we copy the local architecture bindings.
    path.join(ROOT_DIR, 'node_modules', dep.pkg, 'build', 'Release', dep.file),
    path.join(ROOT_DIR, 'node_modules', dep.pkg, 'lib', 'binding', 'napi-v3', dep.file),
    path.join(ROOT_DIR, 'node_modules', dep.pkg, 'prebuilds', 'linux-x64', dep.file)
  ];

  let found = false;
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const destPath = path.join(RESOURCES_BIN_DIR, dep.file);
      fs.copyFileSync(p, destPath);
      console.log(`[Sidecar Build] Copied ${dep.file} successfully.`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.warn(`[Sidecar Build] WARNING: Could not locate compiled binding for ${dep.pkg} (${dep.file})`);
    missingDeps++;
  }
}

console.log('[Sidecar Build] Sidecar compilation and resource bundling complete.');
if (missingDeps > 0) {
  console.warn(`[Sidecar Build] Completed with ${missingDeps} missing native dependencies.`);
}

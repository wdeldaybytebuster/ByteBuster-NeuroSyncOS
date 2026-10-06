const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT_DIR, 'src-tauri');
const BINARIES_DIR = path.join(TAURI_DIR, 'binaries');
const RESOURCES_BIN_DIR = path.join(TAURI_DIR, 'bin');

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

// 1. Run pkg to generate binaries
console.log('[Sidecar Build] Compiling Node.js binary with pkg...');
try {
  // Map standard pkg targets to Tauri target triples
  execSync('npx pkg . --target node18-linux-x64,node18-macos-x64,node18-win-x64 --out-path src-tauri/binaries', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
} catch (e) {
  console.error('[Sidecar Build] pkg compilation failed:', e.message);
  process.exit(1);
}

// Tauri expects sidecar binaries to have the target triple suffix.
// pkg outputs files like: neurosyncmega-linux, neurosyncmega-macos, neurosyncmega-win.exe
// We need to rename them to: sidecar-x86_64-unknown-linux-gnu, sidecar-x86_64-apple-darwin, sidecar-x86_64-pc-windows-msvc.exe

const renameMap = {
  'neurosyncmega-linux': 'sidecar-x86_64-unknown-linux-gnu',
  'neurosyncmega-macos': 'sidecar-x86_64-apple-darwin',
  'neurosyncmega-win.exe': 'sidecar-x86_64-pc-windows-msvc.exe'
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

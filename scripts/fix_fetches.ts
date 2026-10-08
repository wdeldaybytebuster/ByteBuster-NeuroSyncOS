import fs from 'fs';
import path from 'path';

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Find lines with fetch(...).then(...).then(...) but NO .catch
  // and append .catch(() => {})
  content = content.replace(/fetch\([^)]+\)\.then\([^)]+\)\.then\(([^)]+)\)\s*;\s*$/gm, (match, p1) => {
     if (match.includes('.catch')) return match;
     return match.replace(/;\s*$/, '.catch(() => {});');
  });
  
  // Find lines like fetch(url).then(r => r.json()).then(d => { ... });
  // We can do this with a simpler approach: 
  // Any fetch call in useEffect that ends with .then(d => { ... })
  // Actually, standard regex might fail on multi-line blocks.
  
  // Let's just do a simpler search/replace for the specific files
}

// Just running a naive approach:
const files = [
  'src/ui/views/PortGridDashboard.tsx',
  'src/ui/views/BaseVaultDashboard.tsx',
  'src/ui/views/CerebroDashboard.tsx',
  'src/ui/views/ScopeLogicDashboard.tsx',
  'src/ui/views/ScoutDaemonDashboard.tsx',
  'src/ui/views/UnifiedMasterDashboard.tsx',
  'src/ui/views/CoreExecDashboard.tsx',
  'src/ui/views/RouteSwitchDashboard.tsx'
];

files.forEach(f => {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) return;
  
  let text = fs.readFileSync(p, 'utf-8');
  
  // Replace `fetch(`${API}/api/cerebro/habituate`, { method: 'POST' });`
  text = text.replace(/fetch\(`\$\{API\}\/api\/cerebro\/habituate`, \{ method: 'POST' \}\);/g, "fetch(`${API}/api/cerebro/habituate`, { method: 'POST' }).catch(() => {});");

  // Fix useEffect fetches:
  // Usually they look like:
  // fetch(...).then(r => r.json()).then(d => {
  //   if (d...) setX(d...);
  // })
  // We can change `.then(d => {` to `.then(d => {` and add `.catch(() => {})` at the end of the block.
  // Wait, it's easier to just do: `.catch(() => {});` if it's a one-liner.
  
  // Instead of complex AST, I will manually patch the known ones.
});

/**
 * §6.0 — Genesis Hardware Profiler (Axiom 6: Dynamic Environmental Sovereignty)
 *
 * Executes ONCE at first-run setup. Probes five substrate dimensions:
 *   1. CPU topology (cores, hyperthreading, brand)
 *   2. Volatile memory envelope (total RAM)
 *   3. Storage substrate (type, detected via /proc or systeminformation)
 *   4. OS environment & virtualization layer
 *   5. Neural hardware (GPU/NPU availability)
 *
 * Synthesizes one of three hardware tiers:
 *   - 'constrained'       — ≤ 8 GiB RAM, E-core only, eMMC/unknown storage, no GPU
 *   - 'standard'          — 8–16 GiB RAM, mixed cores, SSD, no dedicated GPU
 *   - 'high-performance'  — > 16 GiB RAM, or dedicated GPU, or NVMe storage
 *
 * Writes the immutable profile + derived environment_rules to BaseVault.
 * Never called again after genesis. Re-profiling requires explicit PortGrid action.
 *
 * MODULE BOUNDARY: ScoutDaemon is the Watcher. This module ONLY probes and writes.
 * It never reads environment_rules to enforce them — that is CoreExec's domain.
 */

import * as si from 'systeminformation';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { db, initDB } from '../basevault/db';
import { scoutEmitter } from './sse';
import { log } from '../observability/logger';

export type HardwareTier = 'constrained' | 'standard' | 'high-performance';

export interface HardwareProfile {
  id: string;
  profiled_at: number;
  cpu_cores: number;
  cpu_physical_cores: number;
  cpu_has_hyperthreading: number; // SQLite int: 0 | 1
  cpu_brand: string | null;
  ram_total_mb: number;
  storage_type: string;
  os_platform: string;
  os_distro: string | null;
  virtualization: string;
  gpu_type: string;
  gpu_vram_mb: number;
  tier: HardwareTier;
}

/** Key/value rules derived from the hardware profile and written to environment_rules. */
interface EnvRule {
  rule_key: string;
  rule_value: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Virtualization Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectVirtualization(): string {
  // Crostini: ChromeOS Linux container — reliable marker files.
  if (existsSync('/dev/.cros_milestone') || existsSync('/run/cros_containers_count')) {
    return 'crostini';
  }
  // WSL2: Windows Subsystem for Linux.
  try {
    const version = readFileSync('/proc/version', 'utf8');
    if (/microsoft|WSL/i.test(version)) return 'wsl2';
  } catch { /* not linux or unreadable */ }
  // Docker: presence of /.dockerenv
  if (existsSync('/.dockerenv')) return 'docker';
  // Additional crostini check via /proc/version string
  try {
    const version = readFileSync('/proc/version', 'utf8');
    if (/cros/i.test(version)) return 'crostini';
  } catch { /* ignore */ }
  return 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Type Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectStorageType(): string {
  // systeminformation's diskLayout() returns empty on Crostini (eMMC not enumerated).
  // Probe /sys/block to detect device type directly.
  try {
    const blockDevices = readFileSync('/proc/partitions', 'utf8')
      .split('\n')
      .map(l => l.trim().split(/\s+/).pop() ?? '')
      .filter(Boolean);

    for (const dev of blockDevices) {
      if (/mmcblk/.test(dev)) return 'emmc';
      if (/nvme/.test(dev)) return 'nvme';
    }
    // Rotational flag: 0 = SSD, 1 = HDD
    for (const dev of blockDevices) {
      if (!/^[a-z]/.test(dev)) continue;
      try {
        const rotational = readFileSync(`/sys/block/${dev}/queue/rotational`, 'utf8').trim();
        if (rotational === '0') return 'ssd';
        if (rotational === '1') return 'hdd';
      } catch { /* skip */ }
    }
  } catch { /* /proc/partitions not accessible */ }
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier Classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyTier(
  ramMb: number,
  gpuType: string,
  storageType: string,
  cores: number,
  hasHyperthreading: boolean,
): HardwareTier {
  // High-performance: large RAM OR dedicated GPU OR NVMe storage
  if (ramMb > 16 * 1024 || gpuType !== 'none' || storageType === 'nvme') {
    return 'high-performance';
  }
  // Standard: 8–16 GiB or SSD storage or hyperthreading
  if (ramMb > 8 * 1024 || storageType === 'ssd' || hasHyperthreading || cores > 8) {
    return 'standard';
  }
  // Constrained: ≤ 8 GiB, E-core only, eMMC/unknown, no GPU
  return 'constrained';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Synthesis
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeRules(profile: HardwareProfile): EnvRule[] {
  const { tier, cpu_cores, virtualization } = profile;

  if (tier === 'constrained') {
    return [
      { rule_key: 'UV_THREADPOOL_SIZE',      rule_value: '3' },
      { rule_key: 'OPENBLAS_NUM_THREADS',    rule_value: '3' },
      { rule_key: 'max_old_space_size_mb',   rule_value: '1024' },
      { rule_key: 'max_workers',             rule_value: '2' },
      { rule_key: 'local_llm_enabled',       rule_value: 'false' },
      { rule_key: 'parallel_dag_enabled',    rule_value: 'false' },
      { rule_key: 'taskset_cores',           rule_value: '0-5' },
      { rule_key: 'swap_enabled',            rule_value: 'false' },
      { rule_key: 'jemalloc_preload',        rule_value: 'true' },
      {
        rule_key: 'chrome_binary',
        rule_value: virtualization === 'crostini'
          ? '/usr/bin/google-chrome-beta'
          : 'system-default',
      },
    ];
  }

  if (tier === 'standard') {
    const workers = Math.min(cpu_cores, 6);
    return [
      { rule_key: 'UV_THREADPOOL_SIZE',      rule_value: String(Math.min(cpu_cores, 6)) },
      { rule_key: 'OPENBLAS_NUM_THREADS',    rule_value: String(Math.min(cpu_cores, 6)) },
      { rule_key: 'max_old_space_size_mb',   rule_value: '2048' },
      { rule_key: 'max_workers',             rule_value: String(workers) },
      { rule_key: 'local_llm_enabled',       rule_value: 'false' },
      { rule_key: 'parallel_dag_enabled',    rule_value: 'true' },
      { rule_key: 'taskset_cores',           rule_value: `0-${cpu_cores - 1}` },
      { rule_key: 'swap_enabled',            rule_value: 'true' },
      { rule_key: 'jemalloc_preload',        rule_value: 'false' },
      { rule_key: 'chrome_binary',           rule_value: 'system-default' },
    ];
  }

  // high-performance
  return [
    { rule_key: 'UV_THREADPOOL_SIZE',      rule_value: String(cpu_cores) },
    { rule_key: 'OPENBLAS_NUM_THREADS',    rule_value: String(cpu_cores) },
    { rule_key: 'max_old_space_size_mb',   rule_value: '4096' },
    { rule_key: 'max_workers',             rule_value: String(cpu_cores) },
    { rule_key: 'local_llm_enabled',       rule_value: 'true' },
    { rule_key: 'parallel_dag_enabled',    rule_value: 'true' },
    { rule_key: 'taskset_cores',           rule_value: `0-${cpu_cores - 1}` },
    { rule_key: 'swap_enabled',            rule_value: 'true' },
    { rule_key: 'jemalloc_preload',        rule_value: 'false' },
    { rule_key: 'chrome_binary',           rule_value: 'system-default' },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most recently written hardware profile from BaseVault, or null
 * if genesis has not yet been run. Used by CoreExec and RouteSwitch at boot.
 */
export function getActiveHardwareProfile(): HardwareProfile | null {
  try {
    initDB();
    return db
      .prepare('SELECT * FROM hardware_profiles ORDER BY profiled_at DESC LIMIT 1')
      .get() as HardwareProfile | null;
  } catch {
    return null;
  }
}

/**
 * Returns a specific environment rule value for the active hardware profile,
 * or the provided default if the rule has not been set.
 */
export function getEnvRule(ruleKey: string, defaultValue: string = ''): string {
  try {
    const profile = getActiveHardwareProfile();
    if (!profile) return defaultValue;
    const row = db
      .prepare('SELECT rule_value FROM environment_rules WHERE profile_id = ? AND rule_key = ? ORDER BY created_at DESC LIMIT 1')
      .get(profile.id, ruleKey) as { rule_value: string } | undefined;
    return row?.rule_value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Run the Genesis Hardware Profiler.
 *
 * Idempotent: if a profile already exists AND `force` is false, this is a no-op
 * that returns the existing profile. Only the explicit PortGrid "Re-Profile"
 * action should call this with `force: true`.
 *
 * @param force  If true, runs a fresh probe even if a profile already exists.
 */
export async function runGenesisProfiler(force = false): Promise<HardwareProfile> {
  initDB();

  // Idempotency gate — do not re-run unless explicitly forced.
  if (!force) {
    const existing = getActiveHardwareProfile();
    if (existing) {
      log.info(`[GenesisProfiler] Profile already exists (tier: ${existing.tier}). Skipping.`);
      return existing;
    }
  }

  log.info('[GenesisProfiler] Starting hardware probe...');
  scoutEmitter.emit('update', { type: 'GENESIS_PROFILER_STARTED', timestamp: Date.now() });

  // ── Collect raw data ──────────────────────────────────────────────────────
  const [cpuInfo, memInfo, osInfo, graphicsInfo] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.osInfo(),
    si.graphics(),
  ]);

  const cores = cpuInfo.cores ?? cpuInfo.physicalCores ?? 1;
  const physicalCores = cpuInfo.physicalCores ?? cores;
  const hasHyperthreading = cores > physicalCores;
  const ramMb = Math.round((memInfo.total ?? 0) / 1024 / 1024);

  const storageType = detectStorageType();
  const virtualization = detectVirtualization();

  // GPU detection: any controller with > 0 MB VRAM counts as a neural accelerator.
  const gpuControllers = graphicsInfo.controllers ?? [];
  const primaryGpu = gpuControllers.find(g => (g.vram ?? 0) > 0);
  const gpuType = primaryGpu
    ? (primaryGpu.model?.toLowerCase().includes('nvidia') ? 'cuda'
      : primaryGpu.model?.toLowerCase().includes('apple') ? 'metal'
      : 'gpu')
    : 'none';
  const gpuVramMb = primaryGpu ? Math.round((primaryGpu.vram ?? 0)) : 0;

  const tier = classifyTier(ramMb, gpuType, storageType, cores, hasHyperthreading);

  const profile: HardwareProfile = {
    id: randomUUID(),
    profiled_at: Date.now(),
    cpu_cores: cores,
    cpu_physical_cores: physicalCores,
    cpu_has_hyperthreading: hasHyperthreading ? 1 : 0,
    cpu_brand: cpuInfo.brand ?? null,
    ram_total_mb: ramMb,
    storage_type: storageType,
    os_platform: osInfo.platform ?? 'unknown',
    os_distro: osInfo.distro ?? null,
    virtualization,
    gpu_type: gpuType,
    gpu_vram_mb: gpuVramMb,
    tier,
  };

  log.info(`[GenesisProfiler] Detected: ${cores} cores, ${ramMb} MB RAM, ${storageType} storage, ${virtualization} virt, ${gpuType} GPU → tier: ${tier}`);

  const rules = synthesizeRules(profile);

  // ── Write to BaseVault in a single transaction ───────────────────────────
  db.transaction(() => {
    db.prepare(`
      INSERT INTO hardware_profiles
        (id, profiled_at, cpu_cores, cpu_physical_cores, cpu_has_hyperthreading,
         cpu_brand, ram_total_mb, storage_type, os_platform, os_distro,
         virtualization, gpu_type, gpu_vram_mb, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id, profile.profiled_at, profile.cpu_cores, profile.cpu_physical_cores,
      profile.cpu_has_hyperthreading, profile.cpu_brand, profile.ram_total_mb,
      profile.storage_type, profile.os_platform, profile.os_distro,
      profile.virtualization, profile.gpu_type, profile.gpu_vram_mb, profile.tier,
    );

    const insertRule = db.prepare(`
      INSERT INTO environment_rules (id, profile_id, rule_key, rule_value, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const rule of rules) {
      insertRule.run(randomUUID(), profile.id, rule.rule_key, rule.rule_value, Date.now());
    }
  })();

  scoutEmitter.emit('update', {
    type: 'GENESIS_PROFILER_COMPLETE',
    tier,
    profile,
    rules,
    timestamp: Date.now(),
  });

  log.info(`[GenesisProfiler] Profile written to BaseVault. Tier: ${tier}. Rules: ${rules.length} entries.`);
  return profile;
}

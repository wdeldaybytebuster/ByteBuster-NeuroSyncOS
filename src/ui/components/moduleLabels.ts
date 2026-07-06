// Single source of truth for module naming across the nav (ModuleRouter) and
// the top bar (AppShell). Hobbyist Mode (default) shows the plain-English
// `simple` name; Developer Mode shows the technical `dev` name.
export interface ModuleLabelPair {
  simple: string;
  dev: string;
}

export const MODULE_LABELS: Record<string, ModuleLabelPair> = {
  master: { simple: 'System View', dev: 'System View' },
  coreexec: { simple: 'Task Runner', dev: 'CoreExec Engine' },
  basevault: { simple: 'Storage & Backups', dev: 'BaseVault Storage' },
  routeswitch: { simple: 'AI Model Settings', dev: 'RouteSwitch LLM' },
  scopelogic: { simple: 'Project Planner', dev: 'ScopeLogic' },
  portgrid: { simple: 'Approvals & Tools', dev: 'PortGrid Skills' },
  scoutdaemon: { simple: 'Background Watcher', dev: 'ScoutDaemon' },
  cerebro: { simple: 'Memory', dev: 'Cerebro Memory' },
};

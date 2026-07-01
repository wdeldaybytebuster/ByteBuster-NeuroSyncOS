import { spawn, ChildProcess } from 'child_process';

/**
 * GitNexusClient — optional, best-effort bridge to a locally-installed GitNexus
 * `eval-server` for the Tri-Modal Context Router's "code structure" modality.
 *
 * DESIGN / REAL-WORLD CAVEATS (read before touching this file):
 * - `gitnexus` is an EXTERNAL CLI dev tool, NOT an npm dependency of this app.
 *   Most end users of NeuroSync (solo/hobbyist devs installing this on their own
 *   unrelated projects) will NOT have gitnexus installed, and their project will
 *   NOT be indexed. This modality therefore MUST be fully optional and degrade
 *   silently — it can never block, slow, or break Cerebro chat when absent.
 * - We lazily spawn `gitnexus eval-server` as a long-lived background child on
 *   FIRST use only (never at app boot), health-check it, and reuse it for
 *   subsequent queries (boot costs ~2s — we pay it at most once per process).
 * - Responses from the eval-server are plain, human-readable TEXT (the same
 *   rendering a person sees), not structured JSON. That is exactly what we want:
 *   we prepend the verbatim text to the LLM prompt, same pattern as
 *   OKFGraphQuery.formatContextForPrompt(). We deliberately do NOT parse it.
 * - Repo disambiguation (v1 limitation): a machine can have several repos
 *   indexed. There is no reliable way from inside NeuroSync to know which one is
 *   "this" project. v1 policy: if NEUROSYNC_GITNEXUS_REPO is set, use it; else if
 *   exactly ONE repo is indexed, use it automatically; else give up on this
 *   modality (shut the server down, mark unavailable). We intentionally do NOT
 *   try to auto-detect by matching cwd against `gitnexus list` — that is
 *   over-engineering for an optional best-effort feature.
 * - Invocation resolution mirrors `.gitnexus/run.cjs` conceptually: try a global
 *   `gitnexus` binary first (fast path), fall back to `npx gitnexus@latest` on
 *   ENOENT so machines where gitnexus is only reachable via npx still work.
 */

const DEFAULT_PORT = Number(process.env.NEUROSYNC_GITNEXUS_PORT) || 4939;
const BOOT_TIMEOUT_MS = 15000;
const QUERY_TIMEOUT_MS = 8000;

type ClientState = 'idle' | 'starting' | 'ready' | 'unavailable';

interface RunningServer {
  child: ChildProcess;
  host: string;
  port: number;
  shutdownToken: string | null;
  repo: string; // resolved repo name to pass as the `repo` param
}

let state: ClientState = 'idle';
let startPromise: Promise<RunningServer | null> | null = null;
let server: RunningServer | null = null;

function isDisabled(): boolean {
  // Never spawn subprocesses under the test runner, and honor an explicit kill switch.
  return process.env.VITEST === 'true' || process.env.NEUROSYNC_GITNEXUS_DISABLED === '1';
}

function debug(...args: unknown[]) {
  if (process.env.NEUROSYNC_GITNEXUS_QUIET === '1') return;
  console.log('[GitNexusClient]', ...args);
}

/**
 * Spawn the eval-server, trying the global binary first then `npx` as a fallback.
 * Resolves once the READY line is seen on stdout, or rejects on failure/timeout.
 */
function spawnEvalServer(port: number): Promise<{ child: ChildProcess; host: string; port: number; token: string | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBuf = '';
    let token: string | null = null;

    const attempt = (command: string, args: string[], allowNpxFallback: boolean) => {
      let child: ChildProcess;
      try {
        child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
      } catch (err) {
        if (allowNpxFallback) return attempt('npx', ['gitnexus@latest', 'eval-server', '--port', String(port)], false);
        return reject(err);
      }

      const bootTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        reject(new Error('eval-server boot timed out'));
      }, BOOT_TIMEOUT_MS);
      bootTimer.unref();

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        // ENOENT on the global binary → try npx once.
        if (allowNpxFallback && err.code === 'ENOENT') {
          clearTimeout(bootTimer);
          return attempt('npx', ['gitnexus@latest', 'eval-server', '--port', String(port)], false);
        }
        settled = true;
        clearTimeout(bootTimer);
        reject(err);
      });

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuf += data.toString();
        const tokenMatch = stdoutBuf.match(/GITNEXUS_EVAL_SERVER_SHUTDOWN_TOKEN:(\S+)/);
        if (tokenMatch) token = tokenMatch[1]!;
        const readyMatch = stdoutBuf.match(/GITNEXUS_EVAL_SERVER_READY:([^:\s]+):(\d+)/);
        if (readyMatch && !settled) {
          settled = true;
          clearTimeout(bootTimer);
          resolve({ child, host: readyMatch[1]!, port: Number(readyMatch[2]), token });
        }
      });

      child.on('exit', () => {
        if (settled) return;
        settled = true;
        clearTimeout(bootTimer);
        reject(new Error('eval-server exited before becoming ready'));
      });
    };

    attempt('gitnexus', ['eval-server', '--port', String(port)], true);
  });
}

/**
 * Resolve which indexed repo to query. Returns null if it cannot be
 * unambiguously determined (caller should then skip the modality).
 */
async function resolveRepo(host: string, port: number): Promise<string | null> {
  const override = process.env.NEUROSYNC_GITNEXUS_REPO;
  if (override) return override;

  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { repos?: string[] };
    const repos = body.repos ?? [];
    if (repos.length === 1) return repos[0]!;
    // 0 repos → nothing to query; >1 → cannot disambiguate (v1 limitation).
    return null;
  } catch {
    return null;
  }
}

async function ensureServer(): Promise<RunningServer | null> {
  if (isDisabled()) return null;
  if (state === 'ready') return server;
  if (state === 'unavailable') return null;
  if (startPromise) return startPromise;

  state = 'starting';
  startPromise = (async () => {
    try {
      const { child, host, port, token } = await spawnEvalServer(DEFAULT_PORT);
      const repo = await resolveRepo(host, port);
      if (!repo) {
        debug('no unambiguous indexed repo (set NEUROSYNC_GITNEXUS_REPO to force) — disabling modality');
        await gracefulKill({ child, host, port, shutdownToken: token, repo: '' });
        state = 'unavailable';
        return null;
      }
      server = { child, host, port, shutdownToken: token, repo };
      state = 'ready';
      debug(`eval-server ready on ${host}:${port}, repo="${repo}"`);
      // Clean up the child if the app exits.
      const onExit = () => { void shutdownGitNexus(); };
      process.once('exit', onExit);
      process.once('SIGINT', onExit);
      process.once('SIGTERM', onExit);
      return server;
    } catch (err) {
      debug('eval-server unavailable (gitnexus likely not installed) —', (err as Error).message);
      state = 'unavailable';
      return null;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

async function gracefulKill(s: RunningServer): Promise<void> {
  try {
    if (s.shutdownToken) {
      await fetch(`http://${s.host}:${s.port}/shutdown`, {
        method: 'POST',
        headers: { 'X-Shutdown-Token': s.shutdownToken },
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined);
    }
  } catch { /* ignore */ }
  try { s.child.kill('SIGKILL'); } catch { /* ignore */ }
}

/**
 * Query GitNexus for code-structure context relevant to `query`.
 * Returns the raw human-readable text block, or null if unavailable / no result.
 * NEVER throws.
 */
export async function queryCodeStructure(query: string): Promise<string | null> {
  try {
    const s = await ensureServer();
    if (!s) return null;

    const res = await fetch(`http://${s.host}:${s.port}/tool/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_query: query, repo: s.repo, limit: 2 }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text) return null;
    // The eval-server renders disambiguation / lookup failures as plain-text
    // bodies starting with "Error:" — treat those as "no result", not context.
    if (text.startsWith('Error:')) return null;
    // A "no flows found" style response isn't useful context either.
    if (/^No\b/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

/** Shut down the background eval-server if we started one. Safe to call repeatedly. */
export async function shutdownGitNexus(): Promise<void> {
  const s = server;
  server = null;
  state = 'idle';
  startPromise = null;
  if (s) await gracefulKill(s);
}

/** Test/observability helper. */
export function _getState(): ClientState {
  return state;
}

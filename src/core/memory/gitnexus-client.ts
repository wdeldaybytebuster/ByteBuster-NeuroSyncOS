import { spawn, ChildProcess } from 'child_process';
import { db } from '../basevault/db';
import { egressFetch } from '../routeswitch/egress';

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
 * - Repo disambiguation: a machine can have several repos indexed. Resolution
 *   order per query: (1) NEUROSYNC_GITNEXUS_REPO env override, if set; (2) the
 *   calling project's configured `projects.gitnexus_repo_name`, if it matches
 *   one of the eval-server's indexed repos; (3) if exactly ONE repo is indexed
 *   overall, use it automatically. Otherwise this call yields no context (the
 *   modality itself stays up — a later call with a resolvable hint still
 *   works). We intentionally do NOT try to auto-detect by matching cwd against
 *   `gitnexus list` — that is over-engineering for an optional best-effort
 *   feature.
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
  repos: string[]; // repos indexed on the eval-server, resolved per-query against this list
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

/** Fetch the list of repos the eval-server currently has indexed. */
async function fetchIndexedRepos(host: string, port: number): Promise<string[]> {
  // §2.3 C9 — through the governed egress door. `internal: true`: this is a
  // LOCAL eval-server (host from its READY line, assumed loopback), so the
  // kill switch must not sever it — but a non-loopback host is now blocked
  // (fail-safe: returns [] → the modality degrades silently, per the file
  // contract above). timeoutMs replaces the old inline AbortSignal.
  const res = await egressFetch(
    `http://${host}:${port}/health`,
    { internal: true, timeoutMs: QUERY_TIMEOUT_MS },
    { action: 'fetch', owner: 'memory/gitnexus-client' },
  );
  if (!res.ok) return [];
  const body = JSON.parse(res.text) as { repos?: string[] };
  return body.repos ?? [];
}

/** Look up the project's configured repo name, if any. Never throws. */
function getProjectRepoHint(projectId?: string): string | undefined {
  if (!projectId) return undefined;
  try {
    const row = db.prepare('SELECT gitnexus_repo_name FROM projects WHERE id = ?').get(projectId) as
      | { gitnexus_repo_name: string | null }
      | undefined;
    return row?.gitnexus_repo_name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve which indexed repo to query for this call. Returns null if it cannot
 * be unambiguously determined (caller should then skip the modality for this
 * call, without disabling it for calls that carry a resolvable hint).
 */
function resolveRepoForCall(repos: string[], projectId?: string): string | null {
  const override = process.env.NEUROSYNC_GITNEXUS_REPO;
  if (override) return override;

  const hint = getProjectRepoHint(projectId);
  if (hint && repos.includes(hint)) return hint;

  if (repos.length === 1) return repos[0]!;
  // 0 repos → nothing to query; >1 with no matching hint → cannot disambiguate.
  return null;
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
      const repos = await fetchIndexedRepos(host, port).catch(() => []);
      if (repos.length === 0) {
        debug('no repos indexed — disabling modality');
        await gracefulKill({ child, host, port, shutdownToken: token, repos: [] });
        state = 'unavailable';
        return null;
      }
      server = { child, host, port, shutdownToken: token, repos };
      state = 'ready';
      debug(`eval-server ready on ${host}:${port}, indexed repos=[${repos.join(', ')}]`);
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
      // §2.3 C9 — governed egress (internal/local); egress never throws, and
      // the outer catch below still ignores anything unexpected.
      await egressFetch(
        `http://${s.host}:${s.port}/shutdown`,
        {
          internal: true,
          timeoutMs: 3000,
          method: 'POST',
          headers: { 'X-Shutdown-Token': s.shutdownToken },
        },
        { action: 'fetch', owner: 'memory/gitnexus-client' },
      );
    }
  } catch { /* ignore */ }
  try { s.child.kill('SIGKILL'); } catch { /* ignore */ }
}

/**
 * Query GitNexus for code-structure context relevant to `query`, optionally
 * scoped to a project (used to disambiguate which indexed repo to query when
 * more than one is present — see resolveRepoForCall).
 * Returns the raw human-readable text block, or null if unavailable / no result.
 * NEVER throws.
 */
export async function queryCodeStructure(query: string, projectId?: string): Promise<string | null> {
  try {
    const s = await ensureServer();
    if (!s) return null;

    const repo = resolveRepoForCall(s.repos, projectId);
    if (!repo) return null;

    // §2.3 C9 — governed egress (internal/local eval-server, POST JSON);
    // timeoutMs replaces the old inline AbortSignal. On any block/failure
    // egress returns ok:false → null → silent degradation (never throws).
    const res = await egressFetch(
      `http://${s.host}:${s.port}/tool/query`,
      {
        internal: true,
        timeoutMs: QUERY_TIMEOUT_MS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_query: query, repo, limit: 2 }),
      },
      { action: 'fetch', owner: 'memory/gitnexus-client' },
    );

    if (!res.ok) return null;
    const text = res.text.trim();
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

// ── One-shot `gitnexus query` CLI bridge ──────────────────────────────────
// Used by CoreExec's `gitnexus_mapper` plugin. Kept here (not in worker.ts)
// so all `child_process` usage stays inside the audit's CHILD_PROCESS_ALLOWLIST
// and never leaks raw shell exec into the orchestrator (SA-01).

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

/**
 * Run `gitnexus query --json <query>` against the local GitNexus index.
 * Tries the global `gitnexus` binary first, falls back to `npx gitnexus@latest`
 * on ENOENT (mirrors spawnEvalServer's invocation-resolution strategy).
 * The args array is fixed-length and never shell-interpolated.
 *
 * Returns `{ stdout, stderr }` on success. Throws on non-zero exit or timeout.
 */
export async function runGitNexusQuery(
  query: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  if (isDisabled()) {
    throw new Error('gitnexus_mapper: GitNexus CLI is disabled (VITEST or NEUROSYNC_GITNEXUS_DISABLED=1)');
  }

  const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — AST JSON payloads can be large
  const QUERY_TIMEOUT_MS = 30000;

  const attempt = (cmd: string, args: string[]) =>
    execFileAsync(cmd, args, {
      cwd,
      timeout: QUERY_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

  try {
    return await attempt('gitnexus', ['query', '--json', query]);
  } catch (err: any) {
    // ENOENT on the global binary → try npx once.
    if (err?.code === 'ENOENT') {
      return attempt('npx', ['gitnexus@latest', 'query', '--json', query]);
    }
    throw err;
  }
}

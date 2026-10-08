/**
 * §2.3 C8-d / C9 — StealthScraper with TWO selectable backends.
 *
 * THE BUG UNDER TEST (§4.3): `scrape()` ALWAYS ran `python3 scraper.py` inside
 * CommandSandbox — whose `--unshare-net` bwrap (the control that makes `shell`
 * safe, sandbox.ts) has no network. Every scrape therefore died inside the
 * sandbox instead of ever returning page content.
 *
 * Backend selection — `system_settings.scrape_backend` (lazy read, same
 * fail-safe pattern as egress's kill-switch):
 *   - `'http'` (DEFAULT, and the fallback on any settings-read failure):
 *     governed `egressFetch` (RouteSwitch owns egress — AGENTS.md boundary),
 *     returning the SAME object shape scraper.py prints
 *     (`{status,url,title,content_length,preview}` — scraper.py:25-31) so
 *     worker.ts's `result?.markdown`/`result?.metadata` handling and every
 *     other consumer stay byte-compatible. The sandbox is never invoked.
 *   - `'browser'`: the pre-existing python/sandbox path, unchanged
 *     (see the note on `scrapeViaSandbox` — §5-9).
 *   Nothing is deleted (No Silent Stripping): scraper.py + the python3
 *   command stay exactly as they were.
 *
 * HTTP-backend egress is TWO-STEP (§2.3 C9 design):
 *   1. `{ internal: true }` — loopback targets (local dev services) pass the
 *      host gate with NO DNS and skip the kill switch (a local service is not
 *      "external"). Non-loopback targets are rejected with
 *      'internal-not-loopback' before any I/O.
 *   2. On 'internal-not-loopback' only, retry as a full external request
 *      (`{}`) so the kill switch, DNS/private-range, and project-policy gates
 *      all run — `169.254.169.254` metadata and RFC-1918 targets are stopped
 *      there (§0-V2 SSRF).
 *
 * Errors are final messages (no double-wrapping):
 *   blocked   → `Egress blocked (<reason>) for <url>`
 *   HTTP fail → `Scraping failed: HTTP <status>`  (transport failure, not a
 *               security verdict — never conflated with a block)
 *   network   → `Scraping failed: network error for <url>`
 */
import path from 'path';
import { CommandSandbox } from '../portgrid/sandbox';
import { egressFetch } from '../routeswitch/egress';

/** scraper.py returns the top 2k chars — keep stdout/context bounded (Axiom 6). */
const PREVIEW_MAX = 2000;

/** `system_settings.scrape_backend` → 'browser' only when explicitly set so. */
async function resolveBackend(): Promise<'http' | 'browser'> {
  try {
    // Lazy dynamic import (`.js` suffix — nodenext): never pull BaseVault into
    // bundle-load scope from CoreExec; a broken settings read fails SAFE to
    // the governed HTTP backend rather than the network-less sandbox.
    const { db } = await import('../basevault/db.js');
    const row = db
      .prepare("SELECT value FROM system_settings WHERE key = 'scrape_backend'")
      .get() as { value: string } | undefined;
    return row?.value.trim().toLowerCase() === 'browser' ? 'browser' : 'http';
  } catch {
    return 'http';
  }
}

/**
 * HTML → visible text: drop script/style blocks (never previewed), strip the
 * remaining tags, decode the handful of entities a page actually surfaces in
 * body copy, collapse whitespace. Mirrors what scraper.py gets from the
 * browser's `page.text_content()` for the fields we return.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export class StealthScraper {
  private sandbox: CommandSandbox;
  /** Carried into the egress context so policy decisions are project-scoped. */
  private projectId: string | null;

  constructor(projectId?: string) {
    this.sandbox = new CommandSandbox(projectId);
    this.projectId = projectId ?? null;
  }

  /**
   * Executes a scrape via the configured backend (see module header).
   * @param url The target URL
   * @param headless Whether to use a headless browser window
   */
  public async scrape(url: string, headless: boolean = true): Promise<any> {
    const backend = await resolveBackend();
    if (backend === 'browser') return this.scrapeViaSandbox(url, headless);
    return this.scrapeViaHttp(url);
  }

  /**
   * The governed HTTP backend (default): RouteSwitch's `egressFetch` is the
   * single door — scheme/host/kill-switch/DNS/policy gates + byte cap + timeout
   * all apply exactly as they do to every other outbound call.
   */
  private async scrapeViaHttp(url: string): Promise<any> {
    const ctx = { projectId: this.projectId, action: 'scrape' as const, owner: 'coreexec/scrape' };

    // Step 1: loopback-only. Step 2 (only after 'internal-not-loopback'):
    // full external gates. Internal never consults the kill switch — a
    // loopback target is not an external call.
    let res = await egressFetch(url, { internal: true }, ctx);
    if (res.blocked === 'internal-not-loopback') {
      res = await egressFetch(url, {}, ctx);
    }

    if (res.blocked) {
      const msg = `Egress blocked (${res.blocked}) for ${url}`;
      console.error('[StealthScraper]', msg);
      throw new Error(msg);
    }
    if (!res.ok) {
      // Transport/HTTP failure — NOT a security verdict (kept distinct so
      // PortGrid never shows a policy verdict for a plain 404/timeout-DNS).
      const msg =
        res.status === 0
          ? `Scraping failed: network error for ${url}`
          : `Scraping failed: HTTP ${res.status}`;
      console.error('[StealthScraper]', msg);
      throw new Error(msg);
    }

    // scraper.py-compatible payload (scraper.py:25-31): same five keys, same
    // preview cap. `title` is always a string (empty when absent) so
    // consumers can rely on the type.
    const html = res.text;
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    const text = htmlToText(html);
    return {
      status: 'success',
      url,
      title,
      content_length: text.length,
      preview: text.slice(0, PREVIEW_MAX),
    };
  }

  /**
   * §5-9 (DEFERRED — do not "fix" here): the python path runs scraper.py
   * inside CommandSandbox, whose `--unshare-net` bwrap denies network access.
   * It is therefore EXPECTED TO FAIL for any real URL until an
   * operator-approved network-enabled sandbox exists — which plan §5-9
   * defers, and which is intentionally not offered today. Select it only via
   * `system_settings.scrape_backend = 'browser'`.
   */
  private async scrapeViaSandbox(url: string, headless: boolean): Promise<any> {
    const scriptPath = path.resolve(__dirname, './python_scripts/scraper.py');

    // CommandSandbox only allows specific commands. "python3" is on the allowlist.
    const command = `python3 ${scriptPath} --url ${url}${headless ? ' --headless' : ''}`;

    try {
      const { stdout } = await this.sandbox.execute(command);
      return JSON.parse(stdout);
    } catch (err: any) {
      console.error('[StealthScraper] Error:', err.message);
      throw new Error(`Scraping failed: ${err.message}`);
    }
  }
}

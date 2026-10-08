/**
 * P2-3 — single source of truth for the NeuroSync API port.
 *
 * `NEUROSYNC_PORT` (default 3743) feeds BOTH the mDNS advertisement
 * (server-main.ts MDNSDiscovery) and the Hono `serve({ … })` listener, so
 * the advertised port can never drift from the bound port. Validated to
 * 1–65535; anything else (unset, garbage, out of range, non-integer)
 * falls back to the default.
 *
 * Precedent: NEUROSYNC_GITNEXUS_PORT in core/memory/gitnexus-client.ts
 * (`Number(env) || 4939`); this module states the validation explicitly so
 * the range contract is testable (see port.test.ts).
 */

export const DEFAULT_NEUROSYNC_PORT = 3743;

/** Pure validator — resolves any raw env value to a legal port. */
export function resolveNeurosyncPort(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN;
  if (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 65535) {
    return n as number;
  }
  return DEFAULT_NEUROSYNC_PORT;
}

export const NEUROSYNC_PORT: number = resolveNeurosyncPort(process.env.NEUROSYNC_PORT);

/**
 * P2-B4 — peer-port allowlist (the peer-port trap).
 *
 * `PEER_PORT_ALLOWLIST` is a comma/space-separated env override (e.g.
 * `PEER_PORT_ALLOWLIST=3743,3744`); entries that are not integer ports
 * 1..65535 are dropped. The effective set for manual-pairing and consent
 * approval is ALWAYS {configured NEUROSYNC_PORT} ∪ {allowlist} — the
 * configured port is implicitly allowed so a stock single-port deployment
 * needs no env at all, and an approved peer can never probe an arbitrary
 * LAN port (enforced at the ROUTE layer in server-main.ts, not in the
 * transport, so transport-level pairing tests stay method-signature green).
 */
export function resolvePeerPortAllowlist(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  const out: number[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    if (part === '') continue;
    const n = Number(part);
    if (Number.isInteger(n) && n >= 1 && n <= 65535 && !out.includes(n)) out.push(n);
  }
  return out;
}

export const PEER_PORT_ALLOWLIST: number[] = resolvePeerPortAllowlist(
  process.env.PEER_PORT_ALLOWLIST,
);

/** Effective peer-port set: {configured} ∪ {allowlist}. */
export function allowedPeerPorts(configured: number = NEUROSYNC_PORT): Set<number> {
  return new Set([configured, ...PEER_PORT_ALLOWLIST]);
}

/** True when `port` is a member of the effective peer-port set. */
export function isAllowedPeerPort(port: number, configured: number = NEUROSYNC_PORT): boolean {
  return allowedPeerPorts(configured).has(port);
}

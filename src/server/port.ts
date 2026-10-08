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

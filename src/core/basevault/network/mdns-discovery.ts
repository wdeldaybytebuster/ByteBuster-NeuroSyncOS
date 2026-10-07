import defaultMdns from 'multicast-dns';
import os from 'os';
import { EventEmitter } from 'events';
import { db } from '../db';
import { isSyncEnabled } from './sync-consent';

export interface DiscoveredNode {
  hostname: string;
  ip: string;
  port: number;
}

/** Factory seam so tests can drive the module without opening a UDP socket. */
export type MdnsFactory = () => any;

/**
 * §2.1-C4 — mDNS is opt-in and no longer auto-trusts anyone.
 *
 * - `start()` reads `system_settings.sync_enabled` (default false): when off
 *   it does NOT create the socket, does NOT answer queries and does NOT start
 *   the 5 s beacon (removes both the always-live accept path and the beacon).
 * - When on, `start()` is idempotent (one socket, one interval — no stacking).
 * - `stop()` clears the beacon interval (previously leaked) and is idempotent.
 * - Discovering a peer only EMITS `peer-discovered`; connection is decided by
 *   server-main (pending list → PortGrid consent), never by this module.
 */
export class MDNSDiscovery extends EventEmitter {
  private m: any = null;
  private nodes: Map<string, DiscoveredNode> = new Map();
  private serviceName = 'neurosync._webrtc._udp.local';
  private port: number;
  private beacon: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly dnsFactory: MdnsFactory;

  constructor(port: number, dnsFactory: MdnsFactory = () => defaultMdns()) {
    super();
    this.port = port;
    this.dnsFactory = dnsFactory;
  }

  start() {
    // §2.1-C4: absent/false sync_enabled => total no-op (not even a socket).
    if (!isSyncEnabled(db)) {
      console.log('[mDNS] Sync disabled (system_settings.sync_enabled) — beacon not started.');
      return;
    }
    if (this.running) return; // idempotent: never stack listeners/intervals
    this.running = true;
    if (!this.m) this.m = this.dnsFactory();

    this.m.on('query', (query: any) => {
      if (!this.running) return;
      // Respond to queries for our service
      if (query.questions[0] && query.questions[0].name === this.serviceName) {
        this.m.respond({
          answers: [{
            name: this.serviceName,
            type: 'SRV',
            data: {
              port: this.port,
              weight: 0,
              priority: 10,
              target: os.hostname()
            }
          }, {
            name: os.hostname(),
            type: 'A',
            data: this.getLocalIP()
          }]
        });
      }
    });

    this.m.on('response', (response: any) => {
      if (!this.running) return;
      // Parse answers to discover other nodes
      let srvData: any = null;
      let aData: any = null;

      for (const answer of response.answers) {
        if (answer.type === 'SRV' && answer.name === this.serviceName) {
          srvData = answer.data;
        } else if (answer.type === 'A') {
          aData = answer.data;
        }
      }

      if (srvData && aData) {
        const nodeId = `${aData}:${srvData.port}`;
        if (!this.nodes.has(nodeId)) {
          console.log(`[mDNS] Discovered new node: ${srvData.target} at ${aData}:${srvData.port}`);
          const newNode: DiscoveredNode = {
            hostname: srvData.target,
            ip: aData,
            port: srvData.port
          };
          this.nodes.set(nodeId, newNode);
          // ScoutDaemon spirit: we only EMIT — connection requires PortGrid
          // consent via POST /api/sync/peers (§2.1-C4).
          this.emit('peer-discovered', newNode);
        }
      }
    });

    // Broadcast our presence periodically (stored so stop() can clear it —
    // this interval previously leaked at :75).
    this.beacon = setInterval(() => {
      if (!this.running) return;
      this.m.query({
        questions: [{
          name: this.serviceName,
          type: 'SRV'
        }]
      });
    }, 5000);
  }

  stop() {
    this.running = false;
    if (this.beacon) {
      clearInterval(this.beacon);
      this.beacon = null;
    }
    if (this.m) {
      try {
        this.m.destroy();
      } catch { /* already destroyed */ }
    }
  }

  getDiscoveredNodes(): DiscoveredNode[] {
    return Array.from(this.nodes.values());
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }
}

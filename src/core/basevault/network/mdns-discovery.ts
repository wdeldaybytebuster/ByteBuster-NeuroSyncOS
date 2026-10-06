import mdns from 'multicast-dns';
import os from 'os';
import { EventEmitter } from 'events';

export interface DiscoveredNode {
  hostname: string;
  ip: string;
  port: number;
}

export class MDNSDiscovery extends EventEmitter {
  private m: any;
  private nodes: Map<string, DiscoveredNode> = new Map();
  private serviceName = 'neurosync._webrtc._udp.local';
  private port: number;

  constructor(port: number) {
    super();
    this.port = port;
    this.m = mdns();
  }

  start() {
    this.m.on('query', (query: any) => {
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
          this.emit('peer-discovered', newNode);
        }
      }
    });

    // Broadcast our presence periodically
    setInterval(() => {
      this.m.query({
        questions: [{
          name: this.serviceName,
          type: 'SRV'
        }]
      });
    }, 5000);
  }

  stop() {
    this.m.destroy();
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

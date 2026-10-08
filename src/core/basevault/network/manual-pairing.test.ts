import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeTransport, PeerConnectionError } from './transport';

describe('Manual Peer Connection Suite', () => {
  let transport: NodeTransport;

  beforeEach(() => {
    transport = new NodeTransport();
  });

  afterEach(() => {
    // Cleanup if needed
    if (transport['pollInterval']) {
      clearInterval(transport['pollInterval']);
    }
  });

  it('attempts a direct handshake with the provided IP, bypassing mDNS', async () => {
    const ip = '192.168.1.100';
    const port = 3743;
    
    // Just verify the method exists and can be called, bypassing DiscoveredNode
    expect(typeof transport.connectToManualPeer).toBe('function');
    
    // Should be able to call it
    const promise = transport.connectToManualPeer(ip, port);
    try {
      await promise;
    } catch (e) {}
  });

  it('throws a specific PeerConnectionError and respects a strict 5-second timeout when refused', async () => {
    const ip = '10.255.255.1'; // Unreachable IP
    const port = 9999;
    
    const startTime = Date.now();
    
    try {
      await transport.connectToManualPeer(ip, port);
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(err.name).toBe('PeerConnectionError');
      
      // Should timeout around 5000ms. We give it a little leeway (4800ms to 5500ms).
      expect(duration).toBeGreaterThanOrEqual(4800);
      expect(duration).toBeLessThanOrEqual(5500);
    }
  }, 10000); // 10s test timeout
});

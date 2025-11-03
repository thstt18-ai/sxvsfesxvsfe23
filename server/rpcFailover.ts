
import { ethers } from 'ethers';
import { storage } from './storage';

export interface RpcEndpoint {
  url: string;
  lastCheck: number;
  isHealthy: boolean;
  blockNumber: number;
}

export class RpcFailoverManager {
  private endpoints: RpcEndpoint[] = [];
  private currentIndex = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly STALE_THRESHOLD_MS = 60000; // 60 seconds

  constructor() {
    this.loadEndpoints();
  }

  /**
   * Load RPC endpoints from environment
   */
  private loadEndpoints(): void {
    const rpcUrls = process.env.RPC_URLS?.split(',') || [
      process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      process.env.POLYGON_TESTNET_RPC_URL || 'https://rpc-amoy.polygon.technology',
    ];

    this.endpoints = rpcUrls.map(url => ({
      url: url.trim(),
      lastCheck: 0,
      isHealthy: true,
      blockNumber: 0,
    }));

    console.log(`📡 RPC Failover Manager initialized with ${this.endpoints.length} endpoints`);
  }

  /**
   * Start health monitoring
   */
  startMonitoring(userId: string): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    console.log('🔍 Starting RPC health monitoring...');
    
    this.checkInterval = setInterval(async () => {
      await this.checkAllEndpoints(userId);
    }, this.CHECK_INTERVAL_MS);

    // Initial check
    this.checkAllEndpoints(userId);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('✅ RPC health monitoring stopped');
    }
  }

  /**
   * Get current healthy provider
   */
  getProvider(): ethers.JsonRpcProvider {
    const endpoint = this.endpoints[this.currentIndex];
    return new ethers.JsonRpcProvider(endpoint.url);
  }

  /**
   * Switch to next healthy endpoint
   */
  private async switchToNextEndpoint(userId: string): Promise<boolean> {
    const startIndex = this.currentIndex;
    
    do {
      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
      const endpoint = this.endpoints[this.currentIndex];
      
      if (endpoint.isHealthy) {
        console.log(`🔄 Switched to RPC endpoint: ${endpoint.url}`);
        
        await storage.createActivityLog(userId, {
          type: 'rpc_failover',
          level: 'warning',
          message: `⚠️ Switched to RPC endpoint: ${endpoint.url.substring(0, 30)}...`,
          metadata: {
            previousIndex: startIndex,
            newIndex: this.currentIndex,
            url: endpoint.url,
          },
        });
        
        return true;
      }
    } while (this.currentIndex !== startIndex);

    // All endpoints are unhealthy
    console.error('❌ All RPC endpoints are unhealthy!');
    
    await storage.createActivityLog(userId, {
      type: 'rpc_failover',
      level: 'error',
      message: '🚨 All RPC endpoints are stale! Bot paused.',
      metadata: {
        endpoints: this.endpoints.map(e => ({ url: e.url, healthy: e.isHealthy })),
      },
    });

    // Pause bot
    await storage.updateBotStatus(userId, {
      isPaused: true,
      pauseReason: 'All RPC endpoints are stale',
    });

    return false;
  }

  /**
   * Check health of all endpoints
   */
  private async checkAllEndpoints(userId: string): Promise<void> {
    const promises = this.endpoints.map(async (endpoint, index) => {
      try {
        const provider = new ethers.JsonRpcProvider(endpoint.url);
        const blockNumber = await provider.getBlockNumber();
        const now = Date.now();
        
        // Check if block is stale
        const timeSinceLastBlock = now - endpoint.lastCheck;
        const blockDelta = blockNumber - endpoint.blockNumber;
        
        if (endpoint.lastCheck > 0 && timeSinceLastBlock > this.STALE_THRESHOLD_MS && blockDelta === 0) {
          // Endpoint is stale
          endpoint.isHealthy = false;
          console.warn(`⚠️ RPC endpoint stale: ${endpoint.url} (no new blocks in ${timeSinceLastBlock}ms)`);
          
          // Switch if this is current endpoint
          if (index === this.currentIndex) {
            await this.switchToNextEndpoint(userId);
          }
        } else {
          endpoint.isHealthy = true;
          endpoint.blockNumber = blockNumber;
        }
        
        endpoint.lastCheck = now;
      } catch (error: any) {
        console.error(`❌ RPC endpoint failed: ${endpoint.url}`, error.message);
        endpoint.isHealthy = false;
        
        // Switch if this is current endpoint
        if (index === this.currentIndex) {
          await this.switchToNextEndpoint(userId);
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get health status of all endpoints
   */
  getHealthStatus(): RpcEndpoint[] {
    return this.endpoints.map(e => ({ ...e }));
  }
}

export const rpcFailoverManager = new RpcFailoverManager();

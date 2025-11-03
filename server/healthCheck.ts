import { ethers } from 'ethers';
import { web3Provider } from './web3Provider';
import { killSwitch } from './killSwitch';
import { retryQueueManager } from './retryQueue';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  blockNumber: number;
  pendingTx: number;
  circuitBreaker: boolean;
  timestamp: string;
  rpcHealthy: boolean;
  balances?: {
    matic: string;
    usdc: string;
  };
}

export class HealthCheckService {
  private lastBlockNumber: number = 0;
  private lastCheckTime: number = 0;

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(userId?: string): Promise<HealthStatus> {
    try {
      const provider = web3Provider.getProvider();
      const blockNumber = await provider.getBlockNumber();

      const queueStatus = retryQueueManager.getQueueStatus();
      const circuitBreaker = killSwitch.isKillSwitchActive(userId || 'system');

      // Check if RPC is stale
      const now = Date.now();
      const isStale = this.lastBlockNumber === blockNumber && (now - this.lastCheckTime) > 60000;

      this.lastBlockNumber = blockNumber;
      this.lastCheckTime = now;

      let status: 'ok' | 'degraded' | 'error' = 'ok';

      if (circuitBreaker) {
        status = 'error';
      } else if (queueStatus.pending > 5 || isStale) {
        status = 'degraded';
      }

      return {
        status,
        blockNumber,
        pendingTx: queueStatus.pending,
        circuitBreaker,
        timestamp: new Date().toISOString(),
        rpcHealthy: !isStale,
      };
    } catch (error: any) {
      return {
        status: 'error',
        blockNumber: 0,
        pendingTx: 0,
        circuitBreaker: true,
        timestamp: new Date().toISOString(),
        rpcHealthy: false,
      };
    }
  }

  /**
   * Check balance warnings
   */
  async checkBalanceWarnings(userId: string, walletAddress: string): Promise<void> {
    try {
      const provider = web3Provider.getProvider();
      const maticBalance = await provider.getBalance(walletAddress);

      const minMaticReserve = parseFloat(process.env.MIN_MATIC_RESERVE || '0.5');
      const maticThreshold = ethers.parseEther(minMaticReserve.toString());

      if (maticBalance < maticThreshold) {
        const { storage } = await import('./storage');
        await storage.createActivityLog(userId, {
          type: 'warning',
          level: 'warning',
          message: `⚠️ Low MATIC balance: ${ethers.formatEther(maticBalance)} MATIC`,
          metadata: {
            balance: ethers.formatEther(maticBalance),
            threshold: minMaticReserve,
          },
        });
      }
    } catch (error) {
      console.error('❌ Balance check failed:', error);
    }
  }
}

export const healthCheckService = new HealthCheckService();
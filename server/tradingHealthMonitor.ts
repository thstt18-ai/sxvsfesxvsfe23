
import { storage } from './storage';
import { web3Provider } from './web3Provider';
import { ethers } from 'ethers';

interface HealthMetrics {
  rpcStatus: 'healthy' | 'degraded' | 'down';
  gasPrice: number;
  blockNumber: number;
  walletBalance: string;
  approvalStatus: { [token: string]: boolean };
  contractStatus: 'deployed' | 'not_found' | 'error';
  lastTradeAge: number; // minutes
  errorRate: number; // errors per minute
  profitability: number; // % win rate
}

export class TradingHealthMonitor {
  private metrics: HealthMetrics = {
    rpcStatus: 'down',
    gasPrice: 0,
    blockNumber: 0,
    walletBalance: '0',
    approvalStatus: {},
    contractStatus: 'not_found',
    lastTradeAge: 0,
    errorRate: 0,
    profitability: 0,
  };

  private errorCount: Map<number, number> = new Map(); // timestamp -> count
  private monitorInterval: NodeJS.Timeout | null = null;

  async start(userId: string): Promise<void> {
    console.log('🏥 Starting Trading Health Monitor...');

    // Initial check
    await this.checkHealth(userId);

    // Monitor every 30 seconds
    this.monitorInterval = setInterval(async () => {
      await this.checkHealth(userId);
    }, 30000);
  }

  async stop(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private async checkHealth(userId: string): Promise<void> {
    try {
      // 1. Check RPC status
      try {
        const provider = await web3Provider.getProvider();
        const blockNumber = await provider.getBlockNumber();
        this.metrics.blockNumber = blockNumber;
        this.metrics.rpcStatus = 'healthy';
      } catch (error) {
        this.metrics.rpcStatus = 'down';
        await this.logHealthIssue(userId, 'rpc_down', 'RPC недоступен');
      }

      // 2. Check gas price
      try {
        const gasData = await web3Provider.getGasPrice();
        this.metrics.gasPrice = parseFloat(gasData.gasPriceGwei);
        
        if (this.metrics.gasPrice > 200) {
          await this.logHealthIssue(userId, 'high_gas', `Высокая цена газа: ${this.metrics.gasPrice} Gwei`);
        }
      } catch (error) {
        // Non-critical
      }

      // 3. Check wallet balance
      try {
        const config = await storage.getBotConfig(userId);
        if (config?.walletAddress) {
          const provider = await web3Provider.getProvider();
          const balance = await provider.getBalance(config.walletAddress);
          this.metrics.walletBalance = ethers.formatEther(balance);

          if (parseFloat(this.metrics.walletBalance) < 0.1) {
            await this.logHealthIssue(userId, 'low_balance', `Низкий баланс: ${this.metrics.walletBalance} MATIC`);
          }
        }
      } catch (error) {
        // Non-critical
      }

      // 4. Calculate error rate
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      
      // Clean old entries
      for (const [timestamp] of this.errorCount.entries()) {
        if (timestamp < oneMinuteAgo) {
          this.errorCount.delete(timestamp);
        }
      }

      this.metrics.errorRate = Array.from(this.errorCount.values()).reduce((a, b) => a + b, 0);

      if (this.metrics.errorRate > 10) {
        await this.logHealthIssue(userId, 'high_error_rate', `Высокая частота ошибок: ${this.metrics.errorRate}/мин`);
      }

      // 5. Check profitability from recent trades
      const recentTrades = await storage.getRecentTransactions(userId, 50);
      const profitable = recentTrades.filter(t => t.status === 'success' && parseFloat(t.profitUsd || '0') > 0).length;
      this.metrics.profitability = recentTrades.length > 0 ? (profitable / recentTrades.length) * 100 : 0;

      if (this.metrics.profitability < 30 && recentTrades.length > 10) {
        await this.logHealthIssue(userId, 'low_profitability', `Низкая прибыльность: ${this.metrics.profitability.toFixed(1)}%`);
      }

    } catch (error: any) {
      console.error('Health check error:', error.message);
    }
  }

  private async logHealthIssue(userId: string, type: string, message: string): Promise<void> {
    await storage.createActivityLog(userId, {
      type: 'health_monitor',
      level: 'warning',
      message: `🏥 ${message}`,
      metadata: {
        issueType: type,
        metrics: this.metrics,
      },
    });
  }

  recordError(): void {
    const now = Date.now();
    const currentCount = this.errorCount.get(now) || 0;
    this.errorCount.set(now, currentCount + 1);
  }

  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }
}

export const tradingHealthMonitor = new TradingHealthMonitor();

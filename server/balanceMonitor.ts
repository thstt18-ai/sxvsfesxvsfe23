
import { ethers } from 'ethers';
import { web3Provider } from './web3Provider';
import { storage } from './storage';

export class BalanceMonitor {
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Start monitoring balances
   */
  startMonitoring(userId: string, walletAddress: string): void {
    if (this.monitorInterval) {
      console.log('⚠️ Balance monitor already running');
      return;
    }

    console.log('💰 Starting balance monitor...');
    
    // Initial check
    this.checkBalances(userId, walletAddress);

    // Periodic checks
    this.monitorInterval = setInterval(() => {
      this.checkBalances(userId, walletAddress);
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('✅ Balance monitor stopped');
    }
  }

  /**
   * Check wallet balances
   */
  private async checkBalances(userId: string, walletAddress: string): Promise<void> {
    try {
      const provider = web3Provider.getProvider();
      
      // Check MATIC balance
      const maticBalance = await provider.getBalance(walletAddress);
      const maticAmount = parseFloat(ethers.formatEther(maticBalance));
      
      const minMaticReserve = parseFloat(process.env.MIN_MATIC_RESERVE || '0.5');
      const warningThreshold = minMaticReserve * 2; // 2x the minimum

      if (maticAmount < warningThreshold) {
        await storage.createActivityLog(userId, {
          type: 'warning',
          level: 'warning',
          message: `⚠️ Low MATIC balance: ${maticAmount.toFixed(4)} MATIC (threshold: ${warningThreshold})`,
          metadata: {
            balance: maticAmount,
            threshold: warningThreshold,
            address: walletAddress,
          },
        });

        console.log(`⚠️ Low MATIC balance detected: ${maticAmount.toFixed(4)} MATIC`);
      }

      // Log successful check
      console.log(`💰 Balance check: ${maticAmount.toFixed(4)} MATIC`);
    } catch (error: any) {
      console.error('❌ Balance check failed:', error.message);
      
      await storage.createActivityLog(userId, {
        type: 'error',
        level: 'error',
        message: `❌ Balance check failed: ${error.message}`,
        metadata: { error: error.message },
      });
    }
  }
}

export const balanceMonitor = new BalanceMonitor();

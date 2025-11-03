
import { ethers } from 'ethers';
import { storage } from './storage';

interface ReserveStatus {
  lockedUSDC: bigint;
  totalShares: bigint;
  isHealthy: boolean;
  timestamp: number;
  reserveRatio: number;
}

export class ProofOfReserveMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Start hourly Proof-of-Reserve checks
   */
  async startMonitoring(): Promise<void> {
    if (this.checkInterval) {
      console.warn('PoR monitoring already running');
      return;
    }

    console.log('🔍 Starting Proof-of-Reserve monitoring (hourly)');

    // Initial check
    await this.checkReserves();

    // Hourly checks
    this.checkInterval = setInterval(async () => {
      await this.checkReserves();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('⏹️  Stopped Proof-of-Reserve monitoring');
    }
  }

  /**
   * Check vault reserves against total shares
   */
  async checkReserves(): Promise<ReserveStatus> {
    try {
      const config = await storage.getBotConfig(this.userId);
      if (!config || !config.flashLoanContract) {
        throw new Error('Contract address not configured');
      }

      const provider = new ethers.JsonRpcProvider(
        config.networkMode === 'mainnet' 
          ? config.polygonRpcUrl 
          : config.polygonTestnetRpcUrl
      );

      const vaultAbi = [
        'function totalAssets() view returns (uint256)',
        'function totalSupply() view returns (uint256)'
      ];

      const vault = new ethers.Contract(config.flashLoanContract, vaultAbi, provider);

      const lockedUSDC = await vault.totalAssets();
      const totalShares = await vault.totalSupply();

      const reserveRatio = totalShares > 0n
        ? Number(lockedUSDC * 10000n / totalShares) / 10000
        : 0;

      const isHealthy = lockedUSDC >= totalShares;

      const status: ReserveStatus = {
        lockedUSDC,
        totalShares,
        isHealthy,
        timestamp: Date.now(),
        reserveRatio
      };

      if (!isHealthy) {
        console.error('❌ Proof-of-Reserve FAILED!', status);
        await storage.createActivityLog(this.userId, {
          type: 'proof_of_reserve',
          level: 'error',
          message: `⚠️ RESERVE BREACH: ${reserveRatio.toFixed(4)} ratio`,
          metadata: status,
        });
      } else {
        console.log(`✅ Proof-of-Reserve OK - Ratio: ${reserveRatio.toFixed(4)}`);
        await storage.createActivityLog(this.userId, {
          type: 'proof_of_reserve',
          level: 'info',
          message: `✅ Reserve check passed: ${reserveRatio.toFixed(4)} ratio`,
          metadata: status,
        });
      }

      return status;
    } catch (error: any) {
      console.error('Error checking reserves:', error.message);
      throw error;
    }
  }
}

export const proofOfReserveMonitor = new ProofOfReserveMonitor('demo-user-1');


import { ethers } from 'ethers';
import { EventEmitter } from 'events';

export interface ReserveStatus {
  lockedUSDC: bigint;
  totalShares: bigint;
  isHealthy: boolean;
  timestamp: number;
  reserveRatio: number;
}

export class ProofOfReserveMonitor extends EventEmitter {
  private provider: ethers.JsonRpcProvider;
  private vaultAddress: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private chainlinkPriceFeed: string;

  constructor(
    provider: ethers.JsonRpcProvider,
    vaultAddress: string,
    chainlinkPriceFeed: string
  ) {
    super();
    this.provider = provider;
    this.vaultAddress = vaultAddress;
    this.chainlinkPriceFeed = chainlinkPriceFeed;
  }

  /**
   * Start hourly Proof-of-Reserve checks
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      console.warn('PoR monitoring already running');
      return;
    }

    console.log('🔍 Starting Proof-of-Reserve monitoring (hourly)');

    // Initial check
    this.checkReserves().catch(console.error);

    // Hourly checks
    this.checkInterval = setInterval(() => {
      this.checkReserves().catch(console.error);
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
      const vaultAbi = [
        'function totalAssets() view returns (uint256)',
        'function totalSupply() view returns (uint256)'
      ];

      const vault = new ethers.Contract(this.vaultAddress, vaultAbi, this.provider);

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
        this.emit('reserve_breach', status);
      } else {
        console.log(`✅ Proof-of-Reserve OK - Ratio: ${reserveRatio.toFixed(4)}`);
        this.emit('reserve_check', status);
      }

      return status;
    } catch (error: any) {
      console.error('Error checking reserves:', error.message);
      throw error;
    }
  }
}
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

export async function checkReserve(vaultAddress: string, usdcAddress: string, provider: ethers.Provider) {
  const vault = new ethers.Contract(vaultAddress, ['function totalSupply() view returns (uint256)'], provider);
  const usdc = new ethers.Contract(usdcAddress, ['function balanceOf(address) view returns (uint256)'], provider);

  const totalShares = await vault.totalSupply();
  const lockedUSDC = await usdc.balanceOf(vaultAddress);
  
  const isHealthy = lockedUSDC >= totalShares;
  const ratio = totalShares > 0n ? Number((lockedUSDC * 10000n) / totalShares) / 100 : 0;

  const report = {
    timestamp: new Date().toISOString(),
    lockedUSDC: lockedUSDC.toString(),
    totalShares: totalShares.toString(),
    ratio: `${ratio}%`,
    isHealthy,
    deficit: isHealthy ? '0' : (totalShares - lockedUSDC).toString()
  };

  const logsDir = path.join(process.cwd(), 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  await fs.writeFile(
    path.join(logsDir, 'reserve.json'),
    JSON.stringify(report, null, 2)
  );

  return report;
}

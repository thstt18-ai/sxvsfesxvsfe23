
import { ethers } from 'ethers';
import { walletManager } from './walletManager';
import { dexSwapEngine } from './dexSwapEngine';
import { storage } from './storage';

interface ArbitrageOpportunity {
  tokenPair: string;
  tokenA: string;
  tokenB: string;
  buyDex: string;
  sellDex: string;
  buyPrice: bigint;
  sellPrice: bigint;
  profitPercentage: number;
  estimatedProfit: bigint;
  estimatedGas: bigint;
  netProfit: bigint;
  isProfitable: boolean;
}

// Популярные токены на Polygon
const MONITORED_TOKENS = {
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
};

const DEX_ROUTERS = {
  QuickSwap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
  SushiSwap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
};

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
];

export class ArbitrageMonitor {
  private provider: ethers.JsonRpcProvider | null = null;
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private opportunities: ArbitrageOpportunity[] = [];
  private userId: string | null = null;

  /**
   * Initialize monitor
   */
  async initialize(userId: string, chainId: number): Promise<void> {
    await walletManager.initialize(userId, chainId);
    this.provider = walletManager.getProvider();
    this.userId = userId;

    await storage.createActivityLog(userId, {
      type: 'arbitrage_monitor',
      level: 'info',
      message: '✅ Arbitrage Monitor initialized',
      metadata: { chainId },
    });
  }

  /**
   * Start monitoring
   */
  async start(intervalMs: number = 10000): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Arbitrage monitor already running');
      return;
    }

    if (!this.provider || !this.userId) {
      throw new Error('Arbitrage monitor not initialized');
    }

    console.log('🔍 Starting arbitrage monitor...');
    this.isMonitoring = true;

    this.monitoringInterval = setInterval(async () => {
      await this.scanOpportunities();
    }, intervalMs);

    // First scan immediately
    await this.scanOpportunities();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Arbitrage monitor stopped');
  }

  /**
   * Scan for opportunities
   */
  async scanOpportunities(): Promise<void> {
    if (!this.provider || !this.userId) {
      return;
    }

    console.log('🔎 Scanning for arbitrage opportunities...');
    this.opportunities = [];

    const tokenPairs = [
      { tokenA: MONITORED_TOKENS.WMATIC, tokenB: MONITORED_TOKENS.USDC, name: 'WMATIC/USDC' },
      { tokenA: MONITORED_TOKENS.WETH, tokenB: MONITORED_TOKENS.USDC, name: 'WETH/USDC' },
      { tokenA: MONITORED_TOKENS.WMATIC, tokenB: MONITORED_TOKENS.USDT, name: 'WMATIC/USDT' }
    ];

    for (const pair of tokenPairs) {
      try {
        const opportunity = await this.checkPairArbitrage(pair.tokenA, pair.tokenB, pair.name);
        if (opportunity && opportunity.isProfitable) {
          this.opportunities.push(opportunity);
          
          await storage.createActivityLog(this.userId, {
            type: 'arbitrage_monitor',
            level: 'success',
            message: `💰 Found opportunity: ${opportunity.tokenPair} - ${opportunity.profitPercentage.toFixed(2)}% profit`,
            metadata: {
              tokenPair: opportunity.tokenPair,
              buyDex: opportunity.buyDex,
              sellDex: opportunity.sellDex,
              profitPercentage: opportunity.profitPercentage,
              netProfit: opportunity.netProfit.toString(),
            },
          });
        }
      } catch (error: any) {
        console.error(`Error checking ${pair.name}:`, error.message);
      }
    }

    if (this.opportunities.length === 0) {
      console.log('ℹ️ No profitable opportunities found');
    }
  }

  /**
   * Check arbitrage for token pair
   */
  async checkPairArbitrage(
    tokenA: string,
    tokenB: string,
    pairName: string
  ): Promise<ArbitrageOpportunity | null> {
    if (!this.provider) {
      return null;
    }

    const amountIn = ethers.parseUnits('100', 18); // Test amount

    // Get prices on QuickSwap
    const quickswapRouter = new ethers.Contract(
      DEX_ROUTERS.QuickSwap,
      ROUTER_ABI,
      this.provider
    );

    // Get prices on SushiSwap
    const sushiswapRouter = new ethers.Contract(
      DEX_ROUTERS.SushiSwap,
      ROUTER_ABI,
      this.provider
    );

    try {
      const [quickswapAmounts, sushiswapAmounts] = await Promise.all([
        quickswapRouter.getAmountsOut(amountIn, [tokenA, tokenB]),
        sushiswapRouter.getAmountsOut(amountIn, [tokenA, tokenB])
      ]);

      const quickswapPrice = quickswapAmounts[1];
      const sushiswapPrice = sushiswapAmounts[1];

      // Determine where to buy cheap and sell expensive
      const buyDex = quickswapPrice < sushiswapPrice ? 'QuickSwap' : 'SushiSwap';
      const sellDex = quickswapPrice < sushiswapPrice ? 'SushiSwap' : 'QuickSwap';
      const buyPrice = quickswapPrice < sushiswapPrice ? quickswapPrice : sushiswapPrice;
      const sellPrice = quickswapPrice > sushiswapPrice ? quickswapPrice : sushiswapPrice;

      const profitPercentage = Number((sellPrice - buyPrice) * BigInt(10000) / buyPrice) / 100;
      const estimatedProfit = sellPrice - buyPrice;

      // Estimate gas (2 transactions: buy + sell)
      const estimatedGas = BigInt(500000);
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || BigInt(0);
      const gasCost = estimatedGas * gasPrice;

      const netProfit = estimatedProfit - gasCost;
      const isProfitable = netProfit > BigInt(0);

      return {
        tokenPair: pairName,
        tokenA,
        tokenB,
        buyDex,
        sellDex,
        buyPrice,
        sellPrice,
        profitPercentage,
        estimatedProfit,
        estimatedGas,
        netProfit,
        isProfitable
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current opportunities
   */
  getOpportunities(): ArbitrageOpportunity[] {
    return this.opportunities;
  }

  /**
   * Check if monitoring is running
   */
  isRunning(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get best opportunity
   */
  getBestOpportunity(): ArbitrageOpportunity | null {
    if (this.opportunities.length === 0) return null;
    
    return this.opportunities.reduce((best, current) => {
      return current.netProfit > best.netProfit ? current : best;
    });
  }
}

export const arbitrageMonitor = new ArbitrageMonitor();

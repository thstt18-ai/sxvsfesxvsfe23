
import axios from 'axios';
import { ethers } from 'ethers';
import { storage } from './storage';

export interface PriceFeed {
  token: string;
  price: number;
  timestamp: number;
  source: 'redstone' | 'chainlink';
}

export class OffChainOracle {
  private priceCache: Map<string, PriceFeed> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize RedStone price feeds
   */
  async initialize(userId: string): Promise<void> {
    console.log('🔮 Initializing Off-Chain Oracle (RedStone + Chainlink)');

    // Start price updates every 5 seconds
    this.updateInterval = setInterval(() => {
      this.updatePrices(userId);
    }, 5000);

    // Initial update
    await this.updatePrices(userId);
  }

  /**
   * Update prices from RedStone
   */
  async updatePrices(userId: string): Promise<void> {
    try {
      // RedStone API endpoint
      const response = await axios.get('https://api.redstone.finance/prices', {
        params: {
          symbols: 'MATIC,ETH,BTC,USDC,USDT,BNB,AVAX',
          provider: 'redstone-primary-prod',
        },
      });

      const prices = response.data;

      for (const [symbol, data] of Object.entries(prices as any)) {
        this.priceCache.set(symbol, {
          token: symbol,
          price: data.value,
          timestamp: data.timestamp,
          source: 'redstone',
        });
      }

      console.log(`✅ Updated ${this.priceCache.size} price feeds from RedStone`);
    } catch (error: any) {
      console.error('❌ Failed to update prices:', error.message);

      await storage.createActivityLog(userId, {
        type: 'oracle',
        level: 'error',
        message: `Oracle update failed: ${error.message}`,
        metadata: { error: error.message },
      });
    }
  }

  /**
   * Get real-time price for token
   */
  getPrice(token: string): number {
    const feed = this.priceCache.get(token.toUpperCase());
    if (!feed) {
      console.warn(`⚠️ No price feed for ${token}, using fallback`);
      return 0;
    }

    // Check if price is stale (> 30 seconds)
    if (Date.now() - feed.timestamp > 30000) {
      console.warn(`⚠️ Stale price for ${token}`);
    }

    return feed.price;
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): PriceFeed[] {
    return Array.from(this.priceCache.values());
  }

  /**
   * Stop oracle updates
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('⏹️ Off-Chain Oracle stopped');
    }
  }
}

export const offChainOracle = new OffChainOracle();

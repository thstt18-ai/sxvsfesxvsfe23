import { EventEmitter } from 'events';
import { EventBus } from './event-bus';
import { CircuitBreaker, circuitBreaker } from './circuit-breaker';
import { FlashbotsRelay } from './flashbots-relay';
import { RedisApproveCache, redisCache } from './redis-cache';
import type { CoreConfig, TradeOrder, TradeResult, MarketQuote } from './types';
import { SimMarket } from '../sim/market';
import { SimWallet } from '../sim/wallet';
import { SimExecutor } from '../sim/executor';
import { SimGas } from '../sim/gas';
import { LiveMarket } from '../live/market';
import { LiveWallet } from '../live/wallet';
import { LiveExecutor } from '../live/executor';
import { LiveGas } from '../live/gas';

export class TradingEngine extends EventEmitter {
  private mode: 'simulation' | 'live';
  private config: CoreConfig;
  private market: SimMarket | LiveMarket;
  private wallet: SimWallet | LiveWallet;
  private executor: SimExecutor | LiveExecutor;
  private gas: SimGas | LiveGas;
  private eventBus: EventBus;
  private circuitBreaker: CircuitBreaker;
  private flashbotsRelay?: FlashbotsRelay;
  private approveCache?: RedisApproveCache;

  constructor(mode: 'simulation' | 'live', config: CoreConfig) {
    super();
    this.mode = mode;
    this.config = config;
    this.eventBus = new EventBus();
    this.circuitBreaker = circuitBreaker;

    console.log(`🚀 Trading Engine initialized in ${mode} mode`);

    // Initialize protection systems for live mode
    if (mode === 'live') {
      this.initializeProtectionSystems().catch(console.error);
    }
  }

  private async initializeProtectionSystems(): Promise<void> {
    try {
      // Initialize Flashbots relay for MEV protection
      if (this.config.flashbotsEnabled) {
        const { ethers } = await import('ethers');
        const provider = new ethers.JsonRpcProvider(this.config.rpcUrls[0]);
        const authSigner = new ethers.Wallet(this.config.privateKey!, provider);

        this.flashbotsRelay = new FlashbotsRelay(provider, authSigner);
        await this.flashbotsRelay.initialize();
      }

      // Initialize Redis approve cache
      if (this.config.redisUrl) {
        this.approveCache = redisCache;
        await this.approveCache.connect(this.config.redisUrl);
      }

      console.log('✅ Protection systems initialized');
    } catch (error) {
      console.error('Failed to initialize protection systems:', error);
    }
  }

  async getQuote(pair: string): Promise<MarketQuote> {
    return await this.market.getQuote(pair);
  }

  async getBalance(token: string): Promise<string> {
    return await this.wallet.balanceOf(token);
  }

  async executeTrade(order: TradeOrder): Promise<TradeResult> {
    try {
      // Apply circuit breaker before executing trade
      await this.circuitBreaker.check(order.id);

      const gasEstimate = await this.gas.estimateGas(order);
      const result = await this.executor.swap(order);

      // Update circuit breaker status on successful trade
      this.circuitBreaker.reportSuccess(order.id);

      this.emit('Fill', {
        orderId: order.id,
        price: result.price,
        amount: result.amount,
        gas: gasEstimate,
        timestamp: Date.now()
      });

      return result;
    } catch (error: any) {
      // Report failure to circuit breaker
      this.circuitBreaker.reportFailure(order.id);

      this.emit('Error', {
        orderId: order.id,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  getMode(): 'simulation' | 'live' {
    return this.mode;
  }
}
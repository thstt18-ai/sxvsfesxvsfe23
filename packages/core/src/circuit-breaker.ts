
import { EventEmitter } from 'events';

export interface PriceData {
  price: number;
  timestamp: number;
}

export class CircuitBreaker extends EventEmitter {
  private priceHistory: Map<string, PriceData[]> = new Map();
  private readonly BLACK_SWAN_THRESHOLD = 2.0; // 2% per minute
  private readonly FUNDING_RATE_THRESHOLD = -0.05; // -0.05% per hour
  private circuitOpen: boolean = false;

  /**
   * Check for black swan event (±2% price movement per minute)
   */
  checkBlackSwan(asset: string, currentPrice: number): boolean {
    const history = this.priceHistory.get(asset) || [];
    const now = Date.now();

    // Add current price
    history.push({ price: currentPrice, timestamp: now });

    // Keep only last 2 minutes
    const twoMinutesAgo = now - 2 * 60 * 1000;
    const recentHistory = history.filter(p => p.timestamp > twoMinutesAgo);
    this.priceHistory.set(asset, recentHistory);

    if (recentHistory.length < 2) return false;

    // Check for rapid price change in last minute
    const oneMinuteAgo = now - 60 * 1000;
    const lastMinute = recentHistory.filter(p => p.timestamp > oneMinuteAgo);

    if (lastMinute.length < 2) return false;

    const oldestPrice = lastMinute[0].price;
    const priceChange = Math.abs((currentPrice - oldestPrice) / oldestPrice) * 100;

    if (priceChange >= this.BLACK_SWAN_THRESHOLD) {
      console.error(`🚨 BLACK SWAN DETECTED: ${asset} moved ${priceChange.toFixed(2)}% in 1 minute`);
      this.tripCircuit(asset, priceChange);
      return true;
    }

    return false;
  }

  /**
   * Check funding rate guard (skip trade if funding < -0.05% per hour)
   */
  checkFundingRate(fundingRate: number): boolean {
    if (fundingRate < this.FUNDING_RATE_THRESHOLD) {
      console.warn(`⚠️  Funding rate ${fundingRate}% below threshold - skipping trade`);
      return false;
    }
    return true;
  }

  private tripCircuit(asset: string, priceChange: number): void {
    this.circuitOpen = true;
    this.emit('circuit_breaker_tripped', { asset, priceChange });

    // Auto-reset after 5 minutes
    setTimeout(() => {
      this.circuitOpen = false;
      console.log(`✅ Circuit breaker reset for ${asset}`);
      this.emit('circuit_breaker_reset', { asset });
    }, 5 * 60 * 1000);
  }

  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  reset(): void {
    this.circuitOpen = false;
    this.priceHistory.clear();
  }
}

export const circuitBreaker = new CircuitBreaker();


import { storage } from "./storage";
import { sendTelegramMessage } from "./telegram";
import { isTelegramEnabled } from "./telegramConfig";
import { dexAggregator } from "./dexAggregator";

interface PriceSnapshot {
  tokenAddress: string;
  price: number;
  timestamp: number;
}

class BlackSwanBreaker {
  private priceSnapshots: Map<string, PriceSnapshot[]> = new Map();
  private readonly MAX_PRICE_DROP_PERCENT = 15; // 15% drop per hour triggers stop
  private readonly SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly LOOKBACK_PERIOD_MS = 60 * 60 * 1000; // 1 hour
  private isCircuitBroken = false;

  async captureSnapshot(tokenAddress: string): Promise<void> {
    try {
      const prices = await dexAggregator.getTokenPrices([tokenAddress]);
      const price = prices[tokenAddress];

      if (!price) {
        return;
      }

      const snapshot: PriceSnapshot = {
        tokenAddress,
        price,
        timestamp: Date.now(),
      };

      if (!this.priceSnapshots.has(tokenAddress)) {
        this.priceSnapshots.set(tokenAddress, []);
      }

      const snapshots = this.priceSnapshots.get(tokenAddress)!;
      snapshots.push(snapshot);

      // Keep only last hour of snapshots
      const cutoff = Date.now() - this.LOOKBACK_PERIOD_MS;
      this.priceSnapshots.set(
        tokenAddress,
        snapshots.filter(s => s.timestamp > cutoff)
      );
    } catch (error) {
      console.error("Failed to capture price snapshot:", error);
    }
  }

  async checkBlackSwan(userId: string, tokenAddress: string): Promise<boolean> {
    const snapshots = this.priceSnapshots.get(tokenAddress);

    if (!snapshots || snapshots.length < 2) {
      return false; // Not enough data
    }

    const latest = snapshots[snapshots.length - 1];
    const oldest = snapshots[0];

    const priceChange = ((latest.price - oldest.price) / oldest.price) * 100;

    if (priceChange <= -this.MAX_PRICE_DROP_PERCENT) {
      this.isCircuitBroken = true;

      const message = `🚨 <b>BLACK SWAN EVENT DETECTED!</b>\n\n` +
        `Token: ${tokenAddress.slice(0, 10)}...\n` +
        `Price drop: ${priceChange.toFixed(2)}% in ${((latest.timestamp - oldest.timestamp) / 60000).toFixed(0)} minutes\n` +
        `Old price: $${oldest.price.toFixed(6)}\n` +
        `New price: $${latest.price.toFixed(6)}\n\n` +
        `⛔ Trading STOPPED automatically`;

      console.error(message);

      // Log event
      await storage.createActivityLog(userId, {
        type: 'system',
        level: 'error',
        message: `Black Swan event: ${tokenAddress} dropped ${priceChange.toFixed(2)}%`,
        metadata: { tokenAddress, priceChange, oldPrice: oldest.price, newPrice: latest.price },
      });

      // Create circuit breaker event
      await storage.createCircuitBreakerEvent(userId, {
        eventType: 'black_swan',
        severity: 'critical',
        reason: `Extreme price drop: ${priceChange.toFixed(2)}%`,
        metadata: { tokenAddress, priceChange, oldPrice: oldest.price, newPrice: latest.price },
      });

      // Send Telegram alert
      if (isTelegramEnabled()) {
        await sendTelegramMessage(userId, message);
      }

      return true;
    }

    return false;
  }

  isTriggered(): boolean {
    return this.isCircuitBroken;
  }

  reset(): void {
    this.isCircuitBroken = false;
    console.log("Black Swan breaker reset");
  }
}

export const blackSwanBreaker = new BlackSwanBreaker();

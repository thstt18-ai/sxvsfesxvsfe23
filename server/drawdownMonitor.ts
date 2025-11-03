
import { storage } from './storage';

export interface DrawdownStatus {
  maxEquityUsd: number;
  currentEquityUsd: number;
  drawdownPercent: number;
  limitReached: boolean;
}

export class DrawdownMonitor {
  private maxDrawdownPercent: number;

  constructor() {
    this.maxDrawdownPercent = parseFloat(process.env.MAX_DAILY_DRAWDOWN_PERCENT || '10');
  }

  /**
   * Check daily drawdown and trigger kill switch if needed
   */
  async checkDrawdown(
    userId: string,
    currentEquityUsd: number
  ): Promise<DrawdownStatus> {
    try {
      // Get or initialize max equity
      const tracking = await storage.getRiskLimitsTracking(userId);
      let maxEquityUsd = tracking?.maxEquityToday || currentEquityUsd;

      // Reset max equity at 00:00 UTC
      const now = new Date();
      const lastReset = tracking?.lastResetAt ? new Date(tracking.lastResetAt) : new Date(0);
      
      if (now.getUTCDate() !== lastReset.getUTCDate()) {
        // New day - reset max equity
        maxEquityUsd = currentEquityUsd;
        await storage.updateRiskLimitsTracking(userId, {
          maxEquityToday: maxEquityUsd,
          lastResetAt: now,
        });
      } else if (currentEquityUsd > maxEquityUsd) {
        // Update max equity
        maxEquityUsd = currentEquityUsd;
        await storage.updateRiskLimitsTracking(userId, {
          maxEquityToday: maxEquityUsd,
        });
      }

      // Calculate drawdown
      const drawdownPercent = ((maxEquityUsd - currentEquityUsd) / maxEquityUsd) * 100;
      const limitReached = drawdownPercent >= this.maxDrawdownPercent;

      if (limitReached) {
        console.error(`🚨 DAILY DRAWDOWN LIMIT REACHED: ${drawdownPercent.toFixed(2)}%`);
        
        await storage.createActivityLog(userId, {
          type: 'drawdown_limit',
          level: 'error',
          message: `🚨 Daily drawdown limit reached: ${drawdownPercent.toFixed(2)}% (max: ${this.maxDrawdownPercent}%)`,
          metadata: {
            maxEquityUsd,
            currentEquityUsd,
            drawdownPercent,
            limit: this.maxDrawdownPercent,
          },
        });

        // Trigger emergency stop
        const { killSwitch } = await import('./killSwitch');
        await killSwitch.emergencyStop(userId, 'Daily drawdown limit reached');

        await storage.createCircuitBreakerEvent(userId, {
          reason: 'daily_drawdown_limit',
          triggerValue: drawdownPercent.toString(),
          thresholdValue: this.maxDrawdownPercent.toString(),
        });
      }

      return {
        maxEquityUsd,
        currentEquityUsd,
        drawdownPercent,
        limitReached,
      };
    } catch (error: any) {
      console.error('Drawdown check failed:', error);
      throw error;
    }
  }
}

export const drawdownMonitor = new DrawdownMonitor();

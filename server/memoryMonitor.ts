
import { storage } from './storage';

export class MemoryMonitor {
  private maxMemoryMB: number;
  private checkIntervalMs: number;
  private memoryHistory: number[] = [];
  private maxHistoryLength: number = 24; // 24 hours

  constructor() {
    this.maxMemoryMB = parseInt(process.env.MAX_MEMORY_MB || '500');
    this.checkIntervalMs = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsedMB || usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotalMB || usage.heapTotal / 1024 / 1024),
      rss: Math.round(usage.rssMB || usage.rss / 1024 / 1024),
    };
  }

  /**
   * Check for memory leaks
   */
  async checkMemoryLeak(userId: string): Promise<boolean> {
    const usage = this.getMemoryUsage();
    this.memoryHistory.push(usage.heapUsed);

    if (this.memoryHistory.length > this.maxHistoryLength) {
      this.memoryHistory.shift();
    }

    // Check if memory is consistently growing
    if (this.memoryHistory.length >= 3) {
      const recent = this.memoryHistory.slice(-3);
      const isGrowing = recent.every((val, idx) => idx === 0 || val > recent[idx - 1]);
      
      if (isGrowing && usage.heapUsed > this.maxMemoryMB) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'error',
          message: `⚠️ MEMORY LEAK DETECTED: ${usage.heapUsed}MB (limit: ${this.maxMemoryMB}MB)`,
          metadata: {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            rss: usage.rss,
            trend: this.memoryHistory.slice(-5),
          },
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(userId: string): void {
    setInterval(async () => {
      const hasLeak = await this.checkMemoryLeak(userId);
      if (hasLeak) {
        console.log('⚠️ Memory leak detected - consider restarting');
      }
    }, this.checkIntervalMs);

    console.log('🧠 Memory monitor started');
  }

  /**
   * Get memory stats for health endpoint
   */
  getStats() {
    const usage = this.getMemoryUsage();
    return {
      memory_mb: usage.heapUsed,
      memory_total_mb: usage.heapTotal,
      rss_mb: usage.rss,
      memory_trend: this.memoryHistory.slice(-5),
    };
  }
}

export const memoryMonitor = new MemoryMonitor();

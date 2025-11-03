
import { storage } from './storage';
import { killSwitch } from './killSwitch';
import { retryQueueManager } from './retryQueue';
import { rpcFailoverManager } from './rpcFailover';

export class GracefulShutdown {
  private isShuttingDown = false;
  private readonly SHUTDOWN_TIMEOUT_MS = 60000; // 60 seconds

  /**
   * Initialize shutdown handlers
   */
  initialize(userId: string): void {
    process.on('SIGTERM', () => this.handleShutdown(userId, 'SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown(userId, 'SIGINT'));

    console.log('✅ Graceful shutdown handlers initialized');
  }

  /**
   * Handle shutdown signal
   */
  private async handleShutdown(userId: string, signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log('⚠️ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);

    try {
      // 1. Activate kill switch
      await killSwitch.activateKillSwitch(userId, `Graceful shutdown (${signal})`);
      console.log('✅ Kill switch activated');

      // 2. Wait for pending transactions
      const startTime = Date.now();
      while (Date.now() - startTime < this.SHUTDOWN_TIMEOUT_MS) {
        const queueStatus = retryQueueManager.getQueueStatus();
        if (queueStatus.pending === 0) {
          console.log('✅ All pending transactions completed');
          break;
        }
        console.log(`⏳ Waiting for ${queueStatus.pending} pending transactions...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 3. Stop background services
      retryQueueManager.stopProcessing();
      rpcFailoverManager.stopMonitoring();
      console.log('✅ Background services stopped');

      // 4. Log final status
      await storage.createActivityLog(userId, {
        type: 'system',
        level: 'info',
        message: `🛑 Bot stopped safely via ${signal}`,
        metadata: {
          signal,
          timestamp: new Date().toISOString(),
        },
      });

      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error: any) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  }
}

export const gracefulShutdown = new GracefulShutdown();

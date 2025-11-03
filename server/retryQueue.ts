
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storage } from './storage';

export interface RetryableTransaction {
  txData: any;
  attempt: number;
  nextRetryTimestamp: number;
  userId: string;
  error?: string;
}

export class RetryQueueManager {
  private queue: RetryableTransaction[] = [];
  private deadLetterPath: string;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_INTERVALS_MS = [5000, 15000, 45000]; // 5s, 15s, 45s
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.deadLetterPath = join(process.cwd(), 'logs', 'dead_letter_transactions.csv');
    this.ensureDeadLetterFile();
  }

  /**
   * Ensure dead letter CSV file exists
   */
  private ensureDeadLetterFile(): void {
    const dir = join(process.cwd(), 'logs');
    if (!existsSync(dir)) {
      import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }));
    }

    if (!existsSync(this.deadLetterPath)) {
      const header = 'timestamp,txData,attempts,lastError\n';
      writeFileSync(this.deadLetterPath, header, 'utf8');
    }
  }

  /**
   * Start processing retry queue
   */
  startProcessing(): void {
    if (this.processInterval) {
      return; // Already processing
    }

    console.log('🔄 Starting retry queue processor...');
    
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Check every second
  }

  /**
   * Stop processing retry queue
   */
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
      console.log('✅ Retry queue processor stopped');
    }
  }

  /**
   * Add transaction to retry queue
   */
  async addToQueue(
    userId: string,
    txData: any,
    error: string
  ): Promise<void> {
    // Check if error is retryable
    if (!this.isRetryableError(error)) {
      console.log(`❌ Non-retryable error, skipping queue: ${error}`);
      await this.moveToDeadLetter(userId, txData, 0, error);
      return;
    }

    const retryTx: RetryableTransaction = {
      txData,
      attempt: 0,
      nextRetryTimestamp: Date.now() + this.RETRY_INTERVALS_MS[0],
      userId,
      error,
    };

    this.queue.push(retryTx);
    
    console.log(`📋 Added transaction to retry queue (attempt 1/${this.MAX_ATTEMPTS})`);
    
    await storage.createActivityLog(userId, {
      type: 'retry_queue',
      level: 'warning',
      message: `⚠️ Transaction added to retry queue: ${error}`,
      metadata: {
        attempt: 1,
        maxAttempts: this.MAX_ATTEMPTS,
        nextRetry: new Date(retryTx.nextRetryTimestamp).toISOString(),
      },
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: string): boolean {
    const retryableErrors = [
      'replacement underpriced',
      'timeout',
      'nonce too low',
      'network error',
      'connection error',
    ];

    return retryableErrors.some(e => error.toLowerCase().includes(e.toLowerCase()));
  }

  /**
   * Process retry queue
   */
  private async processQueue(): Promise<void> {
    const now = Date.now();
    const readyToRetry = this.queue.filter(tx => tx.nextRetryTimestamp <= now);

    for (const tx of readyToRetry) {
      await this.retryTransaction(tx);
    }

    // Remove processed transactions
    this.queue = this.queue.filter(tx => tx.nextRetryTimestamp > now);
  }

  /**
   * Retry transaction execution
   */
  private async retryTransaction(tx: RetryableTransaction): Promise<void> {
    tx.attempt++;
    
    console.log(`🔄 Retrying transaction (attempt ${tx.attempt}/${this.MAX_ATTEMPTS})...`);

    try {
      // Import tradeExecutor dynamically to avoid circular dependency
      const { tradeExecutor } = await import('./tradeExecutor');
      
      // Re-execute the trade
      const result = await tradeExecutor.executeArbitrageTrade(
        tx.userId,
        tx.txData,
        false // Real trading
      );

      if (result.success) {
        console.log(`✅ Retry successful on attempt ${tx.attempt}`);
        
        await storage.createActivityLog(tx.userId, {
          type: 'retry_queue',
          level: 'success',
          message: `✅ Transaction retry successful (attempt ${tx.attempt}/${this.MAX_ATTEMPTS})`,
          metadata: {
            attempt: tx.attempt,
            txHash: result.txHash,
          },
        });
        
        // Remove from queue
        this.queue = this.queue.filter(t => t !== tx);
      } else {
        throw new Error(result.error || 'Retry failed');
      }
    } catch (error: any) {
      console.error(`❌ Retry attempt ${tx.attempt} failed:`, error.message);
      
      if (tx.attempt >= this.MAX_ATTEMPTS) {
        // Max attempts reached, move to dead letter
        await this.moveToDeadLetter(tx.userId, tx.txData, tx.attempt, error.message);
        
        // Remove from queue
        this.queue = this.queue.filter(t => t !== tx);
      } else {
        // Schedule next retry
        tx.nextRetryTimestamp = Date.now() + this.RETRY_INTERVALS_MS[tx.attempt];
        tx.error = error.message;
        
        await storage.createActivityLog(tx.userId, {
          type: 'retry_queue',
          level: 'warning',
          message: `⚠️ Retry attempt ${tx.attempt} failed, will retry in ${this.RETRY_INTERVALS_MS[tx.attempt] / 1000}s`,
          metadata: {
            attempt: tx.attempt,
            maxAttempts: this.MAX_ATTEMPTS,
            error: error.message,
            nextRetry: new Date(tx.nextRetryTimestamp).toISOString(),
          },
        });
      }
    }
  }

  /**
   * Move transaction to dead letter file
   */
  private async moveToDeadLetter(
    userId: string,
    txData: any,
    attempts: number,
    error: string
  ): Promise<void> {
    const row = `${new Date().toISOString()},"${JSON.stringify(txData).replace(/"/g, '""')}",${attempts},"${error.replace(/"/g, '""')}"\n`;
    appendFileSync(this.deadLetterPath, row, 'utf8');
    
    console.log(`💀 Transaction moved to dead letter file after ${attempts} attempts`);
    
    await storage.createActivityLog(userId, {
      type: 'retry_queue',
      level: 'error',
      message: `💀 Transaction failed after ${attempts} retry attempts and moved to dead letter file`,
      metadata: {
        attempts,
        error,
        deadLetterFile: this.deadLetterPath,
      },
    });
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; transactions: RetryableTransaction[] } {
    return {
      pending: this.queue.length,
      transactions: this.queue.map(t => ({ ...t })),
    };
  }
}

export const retryQueueManager = new RetryQueueManager();

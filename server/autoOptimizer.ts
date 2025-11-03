
import { strategyOptimizer } from './strategyOptimizer';
import { storage } from './storage';

class AutoOptimizer {
  private interval: NodeJS.Timeout | null = null;
  private readonly OPTIMIZATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly DEMO_USER_ID = 'demo-user-1';

  /**
   * Запуск автоматической оптимизации каждые 24 часа
   */
  start(): void {
    if (this.interval) {
      console.log('⚠️ Auto-optimizer already running');
      return;
    }

    console.log('🤖 Starting auto-optimizer (24h interval)');

    // Первая оптимизация сразу
    this.runOptimization().catch(console.error);

    // Затем каждые 24 часа
    this.interval = setInterval(() => {
      this.runOptimization().catch(console.error);
    }, this.OPTIMIZATION_INTERVAL);
  }

  /**
   * Остановка автоматической оптимизации
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('🛑 Auto-optimizer stopped');
    }
  }

  /**
   * Выполнение одного цикла оптимизации
   */
  private async runOptimization(): Promise<void> {
    try {
      console.log('🔄 Running automatic strategy optimization...');

      // Анализ производительности
      const metrics = await strategyOptimizer.analyzePerformance(this.DEMO_USER_ID);

      await storage.createActivityLog(this.DEMO_USER_ID, {
        type: 'auto_optimization',
        level: 'info',
        message: `📊 Метрики за 30 дней: Win Rate ${(metrics.winRate * 100).toFixed(1)}%, Sharpe ${metrics.sharpeRatio.toFixed(2)}`,
        metadata: { metrics }
      });

      // Проверка безопасности торговли
      const safetyCheck = await strategyOptimizer.shouldTrade(this.DEMO_USER_ID);
      if (!safetyCheck.allowed) {
        await storage.createActivityLog(this.DEMO_USER_ID, {
          type: 'auto_optimization',
          level: 'warning',
          message: `⚠️ Торговля приостановлена: ${safetyCheck.reason}`,
          metadata: { reason: safetyCheck.reason }
        });

        // Приостановить бота
        await storage.updateBotStatus(this.DEMO_USER_ID, {
          isPaused: true,
          pauseReason: safetyCheck.reason
        });

        return;
      }

      // Оптимизация параметров
      await strategyOptimizer.optimizeParameters(this.DEMO_USER_ID);

      console.log('✅ Automatic optimization completed');
    } catch (error: any) {
      console.error('❌ Auto-optimization error:', error);
      
      await storage.createActivityLog(this.DEMO_USER_ID, {
        type: 'auto_optimization',
        level: 'error',
        message: `❌ Ошибка автооптимизации: ${error.message}`,
        metadata: { error: error.message }
      });
    }
  }

  isRunning(): boolean {
    return this.interval !== null;
  }
}

export const autoOptimizer = new AutoOptimizer();

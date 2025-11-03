
import { db } from './db';
import { botConfig, activityLogs, arbitrageTransactions } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { PublicClient, createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';
import logger from './utils/logger';

interface StrategyState {
  isRunning: boolean;
  mode: 'flashloan' | 'direct_swap' | 'hybrid';
  useFlashbots: boolean;
  currentGasPrice: bigint;
  lastCheck: Date;
}

class LiveStrategyOrchestrator {
  private state: StrategyState = {
    isRunning: false,
    mode: 'direct_swap',
    useFlashbots: false,
    currentGasPrice: 0n,
    lastCheck: new Date()
  };

  private client: PublicClient;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.client = createPublicClient({
      chain: polygon,
      transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com')
    });
  }

  /**
   * Запустить мониторинг с текущими настройками из БД
   */
  async start() {
    try {
      // Загрузить конфигурацию
      const config = await db.select().from(botConfig).limit(1);
      if (!config || config.length === 0) {
        throw new Error('Bot config not found');
      }

      const cfg = config[0];

      // Определить режим работы
      this.state.mode = cfg.flashLoanContract ? 'flashloan' : 'direct_swap';
      this.state.useFlashbots = cfg.useFlashbots || false;
      this.state.isRunning = true;

      logger.info('🚀 Live Strategy Orchestrator started', {
        mode: this.state.mode,
        flashbots: this.state.useFlashbots,
        contract: cfg.flashLoanContract
      });

      // Запустить мониторинг цен каждые 500ms
      this.monitoringInterval = setInterval(() => {
        this.monitorPrices().catch(err => {
          logger.error('Price monitoring error', err);
        });
      }, 500);

      await this.logActivity('strategy_started', 'success', 
        `Strategy started in ${this.state.mode} mode`);
    } catch (error: any) {
      logger.error('Failed to start orchestrator', error);
      throw error;
    }
  }

  /**
   * Остановить мониторинг
   */
  async stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.state.isRunning = false;

    await this.logActivity('strategy_stopped', 'info', 'Strategy stopped by user');
    logger.info('🛑 Live Strategy Orchestrator stopped');
  }

  /**
   * Мониторинг цен на DEX
   */
  private async monitorPrices() {
    try {
      // Проверить gas price
      const gasPrice = await this.client.getGasPrice();
      this.state.currentGasPrice = gasPrice;
      this.state.lastCheck = new Date();

      // Проверить максимальный gas
      const config = await db.select().from(botConfig).limit(1);
      const maxGasGwei = config[0]?.maxGasPriceGwei || 100;
      const gasPriceGwei = Number(gasPrice) / 1e9;

      if (gasPriceGwei > maxGasGwei) {
        logger.warn('⚠️ Gas price too high, skipping', {
          current: gasPriceGwei,
          max: maxGasGwei
        });
        return;
      }

      // Здесь должна быть логика поиска арбитражных возможностей
      // Пока просто логируем статус
      logger.debug('Monitoring prices', {
        gasPrice: gasPriceGwei,
        mode: this.state.mode
      });
    } catch (error: any) {
      logger.error('Monitor prices error', error);
    }
  }

  /**
   * Получить текущее состояние стратегии
   */
  getState() {
    return {
      ...this.state,
      currentGasPriceGwei: Number(this.state.currentGasPrice) / 1e9
    };
  }

  /**
   * Обновить режим стратегии
   */
  async updateMode(mode: 'flashloan' | 'direct_swap' | 'hybrid') {
    this.state.mode = mode;
    await this.logActivity('strategy_mode_changed', 'info', `Mode changed to ${mode}`);
    logger.info(`Strategy mode updated to ${mode}`);
  }

  /**
   * Логирование активности
   */
  private async logActivity(type: string, level: string, message: string) {
    await db.insert(activityLogs).values({
      userId: 'system',
      type,
      level,
      message,
      metadata: { orchestrator: true },
      createdAt: new Date()
    });
  }
}

// Singleton instance
export const orchestrator = new LiveStrategyOrchestrator();

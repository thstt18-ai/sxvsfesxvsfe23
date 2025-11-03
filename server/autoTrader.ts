
import { storage } from './storage';
import { opportunityScanner } from './opportunityScanner';
import { tradeExecutor } from './tradeExecutor';
import type { ArbitrageOpportunity } from './opportunityScanner';

export class AutoTrader {
  private isRunning: boolean = false;
  private tradingLog: Array<{
    timestamp: string;
    action: string;
    details: any;
    profit?: number;
    error?: string;
  }> = [];

  /**
   * Начать автоматическую торговлю
   */
  async start(userId: string): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ AutoTrader уже запущен');
      return;
    }

    this.isRunning = true;
    this.log('START', 'Запуск автоматического трейдера');

    try {
      const config = await storage.getBotConfig(userId);
      
      // Проверка конфигурации
      if (!config) {
        throw new Error('Конфигурация не найдена');
      }

      this.log('CONFIG', {
        networkMode: config.networkMode,
        flashLoanAmount: config.flashLoanAmount,
        minProfit: config.minNetProfitPercent,
        useSimulation: config.useSimulation,
      });

      // Автоматический выбор валют (топ ликвидные пары)
      const selectedPairs = this.selectBestTradingPairs();
      this.log('PAIRS_SELECTED', {
        count: selectedPairs.length,
        pairs: selectedPairs.map(p => `${p.tokenIn}/${p.tokenOut}`)
      });

      // Запуск сканера с выбранными парами
      await opportunityScanner.startScanning(
        userId,
        {
          tokenPairs: selectedPairs,
          minProfitPercent: parseFloat(config.minProfitPercent?.toString() || '0.3'),
          minNetProfitPercent: parseFloat(config.minNetProfitPercent?.toString() || '0.15'),
        },
        async (opportunity: ArbitrageOpportunity) => {
          await this.handleOpportunity(userId, opportunity);
        }
      );

      this.log('SCANNER_STARTED', 'Сканер возможностей запущен');

    } catch (error: any) {
      this.log('ERROR', error.message, undefined, error.message);
      throw error;
    }
  }

  /**
   * Остановить автоматическую торговлю
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    await opportunityScanner.stopScanning();
    this.log('STOP', 'Автоматический трейдер остановлен');
  }

  /**
   * Автоматический выбор лучших торговых пар
   */
  private selectBestTradingPairs(): Array<{ tokenIn: string; tokenOut: string }> {
    // Топ ликвидные пары на Polygon
    const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
    const DAI = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
    const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
    const WETH = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
    const WBTC = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6';

    return [
      { tokenIn: USDC, tokenOut: USDT },
      { tokenIn: USDC, tokenOut: DAI },
      { tokenIn: USDC, tokenOut: WMATIC },
      { tokenIn: USDC, tokenOut: WETH },
      { tokenIn: WMATIC, tokenOut: WETH },
      { tokenIn: USDT, tokenOut: DAI },
      { tokenIn: WETH, tokenOut: WBTC },
    ];
  }

  /**
   * Обработка найденной возможности
   */
  private async handleOpportunity(userId: string, opportunity: ArbitrageOpportunity): Promise<void> {
    this.log('OPPORTUNITY_FOUND', {
      pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
      profit: opportunity.estimatedProfitUsd,
      profitPercent: opportunity.netProfitPercent,
      buyDex: opportunity.buyDex,
      sellDex: opportunity.sellDex,
    });

    try {
      const config = await storage.getBotConfig(userId);
      const isSimulation = config?.useSimulation !== false;

      this.log('EXECUTING_TRADE', {
        mode: isSimulation ? 'SIMULATION' : 'REAL',
        pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
      });

      // Исполнение сделки
      const result = await tradeExecutor.executeArbitrageTrade(
        userId,
        opportunity,
        isSimulation
      );

      if (result.success) {
        this.log('TRADE_SUCCESS', {
          txHash: result.txHash,
          profit: result.profitUsd,
          gasCost: result.gasCostUsd,
        }, result.profitUsd);
      } else {
        this.log('TRADE_FAILED', {
          error: result.error,
          message: result.message,
        }, undefined, result.error);
      }

    } catch (error: any) {
      this.log('TRADE_ERROR', {
        pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
      }, undefined, error.message);
    }
  }

  /**
   * Логирование действий
   */
  private log(action: string, details: any, profit?: number, error?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      profit,
      error,
    };

    this.tradingLog.push(logEntry);

    // Ограничиваем размер лога
    if (this.tradingLog.length > 1000) {
      this.tradingLog.shift();
    }

    // Вывод в консоль
    const emoji = error ? '❌' : profit ? '💰' : '📊';
    console.log(`${emoji} [AutoTrader] ${action}:`, details);
  }

  /**
   * Получить лог действий
   */
  getLog(): Array<any> {
    return this.tradingLog;
  }

  /**
   * Получить статистику
   */
  getStats(): {
    isRunning: boolean;
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalProfit: number;
    errors: number;
  } {
    const trades = this.tradingLog.filter(l => l.action === 'TRADE_SUCCESS' || l.action === 'TRADE_FAILED');
    const successful = this.tradingLog.filter(l => l.action === 'TRADE_SUCCESS');
    const failed = this.tradingLog.filter(l => l.action === 'TRADE_FAILED');
    const errors = this.tradingLog.filter(l => l.error);
    const totalProfit = successful.reduce((sum, l) => sum + (l.profit || 0), 0);

    return {
      isRunning: this.isRunning,
      totalTrades: trades.length,
      successfulTrades: successful.length,
      failedTrades: failed.length,
      totalProfit,
      errors: errors.length,
    };
  }
}

export const autoTrader = new AutoTrader();

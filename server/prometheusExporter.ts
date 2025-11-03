
import { storage } from './storage';

export class PrometheusExporter {
  /**
   * Генерация метрик в формате Prometheus
   */
  async exportMetrics(userId: string): Promise<string> {
    const status = await storage.getBotStatus(userId);
    const tracking = await storage.getRiskLimitsTracking(userId);
    const transactions = await storage.getArbitrageTransactions(userId, 100);

    const successfulTrades = transactions.filter(t => t.status === 'success').length;
    const failedTrades = transactions.filter(t => t.status === 'failed').length;
    const totalProfit = transactions
      .filter(t => t.netProfitUsd)
      .reduce((sum, t) => sum + parseFloat(t.netProfitUsd?.toString() || '0'), 0);

    const metrics = [
      '# HELP arbitrage_bot_running Bot running status',
      '# TYPE arbitrage_bot_running gauge',
      `arbitrage_bot_running{user="${userId}"} ${status?.isRunning ? 1 : 0}`,
      '',
      '# HELP arbitrage_bot_paused Bot paused status',
      '# TYPE arbitrage_bot_paused gauge',
      `arbitrage_bot_paused{user="${userId}"} ${status?.isPaused ? 1 : 0}`,
      '',
      '# HELP arbitrage_bot_total_profit_usd Total profit in USD',
      '# TYPE arbitrage_bot_total_profit_usd counter',
      `arbitrage_bot_total_profit_usd{user="${userId}"} ${totalProfit}`,
      '',
      '# HELP arbitrage_bot_successful_trades Total successful trades',
      '# TYPE arbitrage_bot_successful_trades counter',
      `arbitrage_bot_successful_trades{user="${userId}"} ${successfulTrades}`,
      '',
      '# HELP arbitrage_bot_failed_trades Total failed trades',
      '# TYPE arbitrage_bot_failed_trades counter',
      `arbitrage_bot_failed_trades{user="${userId}"} ${failedTrades}`,
      '',
      '# HELP arbitrage_bot_daily_loss_usd Daily loss in USD',
      '# TYPE arbitrage_bot_daily_loss_usd gauge',
      `arbitrage_bot_daily_loss_usd{user="${userId}"} ${parseFloat(tracking?.dailyLossUsd?.toString() || '0')}`,
      '',
      '# HELP arbitrage_bot_daily_trade_count Daily trade count',
      '# TYPE arbitrage_bot_daily_trade_count gauge',
      `arbitrage_bot_daily_trade_count{user="${userId}"} ${tracking?.dailyTradeCount || 0}`,
      '',
      '# HELP arbitrage_bot_gas_spent_usd Gas spent in USD',
      '# TYPE arbitrage_bot_gas_spent_usd counter',
      `arbitrage_bot_gas_spent_usd{user="${userId}"} ${parseFloat(tracking?.dailyGasUsedUsd?.toString() || '0')}`,
    ];

    return metrics.join('\n');
  }
}

export const prometheusExporter = new PrometheusExporter();

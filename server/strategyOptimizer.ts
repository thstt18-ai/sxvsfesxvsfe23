
import { storage } from './storage';
import { db } from './db';
import { botConfig, arbitrageTransactions } from '../shared/schema';
import { eq, gte, sql } from 'drizzle-orm';

interface StrategyMetrics {
  winRate: number;
  sharpeRatio: number;
  avgProfitUsd: number;
  totalGasSpent: number;
  totalTrades: number;
  successfulTrades: number;
}

export class StrategyOptimizer {
  private readonly MIN_SHARPE_RATIO = 0.5;
  private readonly MIN_WIN_RATE = 0.6;

  /**
   * Анализ исторических метрик за последние 30 дней
   */
  async analyzePerformance(userId: string): Promise<StrategyMetrics> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const transactions = await db
      .select()
      .from(arbitrageTransactions)
      .where(
        eq(arbitrageTransactions.userId, userId)
      );

    const recentTx = transactions.filter(tx => 
      tx.createdAt && tx.createdAt >= thirtyDaysAgo
    );

    const totalTrades = recentTx.length;
    const successfulTrades = recentTx.filter(tx => tx.status === 'success').length;
    const winRate = totalTrades > 0 ? successfulTrades / totalTrades : 0;

    const profits = recentTx
      .filter(tx => tx.netProfitUsd)
      .map(tx => parseFloat(tx.netProfitUsd?.toString() || '0'));

    const avgProfit = profits.length > 0 
      ? profits.reduce((a, b) => a + b, 0) / profits.length 
      : 0;

    const stdDev = this.calculateStdDev(profits);
    const sharpeRatio = stdDev > 0 ? avgProfit / stdDev : 0;

    const totalGasSpent = recentTx
      .filter(tx => tx.gasCostUsd)
      .reduce((sum, tx) => sum + parseFloat(tx.gasCostUsd?.toString() || '0'), 0);

    return {
      winRate,
      sharpeRatio,
      avgProfitUsd: avgProfit,
      totalGasSpent,
      totalTrades,
      successfulTrades
    };
  }

  /**
   * Автоматическая оптимизация параметров на основе метрик
   */
  async optimizeParameters(userId: string): Promise<void> {
    const metrics = await this.analyzePerformance(userId);
    const config = await storage.getBotConfig(userId);

    if (!config) return;

    const updates: any = {};

    // Оптимизация slippage на основе win rate
    if (metrics.winRate < this.MIN_WIN_RATE) {
      const currentSlippage = parseFloat(config.staticSlippagePercent?.toString() || '0.5');
      const newSlippage = Math.min(currentSlippage + 0.2, 1.0);
      updates.staticSlippagePercent = newSlippage.toString();
      
      await storage.createActivityLog(userId, {
        type: 'strategy_optimization',
        level: 'info',
        message: `🔧 Увеличен slippage: ${currentSlippage}% → ${newSlippage}% (win rate: ${(metrics.winRate * 100).toFixed(1)}%)`,
        metadata: { oldValue: currentSlippage, newValue: newSlippage, reason: 'low_win_rate' }
      });
    }

    // Оптимизация min profit на основе gas costs
    if (metrics.totalGasSpent > 0 && metrics.totalTrades > 0) {
      const avgGasPerTrade = metrics.totalGasSpent / metrics.totalTrades;
      const recommendedMinProfit = avgGasPerTrade * 3; // 3x gas coverage
      
      const currentMinProfit = parseFloat(config.minNetProfitUsd?.toString() || '1.5');
      if (currentMinProfit < recommendedMinProfit) {
        updates.minNetProfitUsd = recommendedMinProfit.toFixed(2);
        
        await storage.createActivityLog(userId, {
          type: 'strategy_optimization',
          level: 'info',
          message: `💰 Увеличен min profit: $${currentMinProfit} → $${recommendedMinProfit.toFixed(2)} (avg gas: $${avgGasPerTrade.toFixed(2)})`,
          metadata: { oldValue: currentMinProfit, newValue: recommendedMinProfit, avgGas: avgGasPerTrade }
        });
      }
    }

    // Оптимизация max gas на основе прибыльности
    if (metrics.sharpeRatio < this.MIN_SHARPE_RATIO) {
      const currentMaxGas = config.maxGasPriceGwei || 60;
      const newMaxGas = Math.max(currentMaxGas - 10, 30);
      updates.maxGasPriceGwei = newMaxGas;
      
      await storage.createActivityLog(userId, {
        type: 'strategy_optimization',
        level: 'warning',
        message: `⚠️ Снижен max gas: ${currentMaxGas} → ${newMaxGas} Gwei (Sharpe: ${metrics.sharpeRatio.toFixed(2)})`,
        metadata: { oldValue: currentMaxGas, newValue: newMaxGas, reason: 'low_sharpe_ratio' }
      });
    }

    // Применить обновления
    if (Object.keys(updates).length > 0) {
      await storage.upsertBotConfig(userId, updates);
      
      await storage.createActivityLog(userId, {
        type: 'strategy_optimization',
        level: 'success',
        message: `✅ Автоматическая оптимизация завершена: ${Object.keys(updates).length} параметров обновлено`,
        metadata: { updates, metrics }
      });
    }
  }

  /**
   * Расчет стандартного отклонения
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Проверка безопасности торговли
   */
  async shouldTrade(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const metrics = await this.analyzePerformance(userId);

    if (metrics.sharpeRatio < this.MIN_SHARPE_RATIO && metrics.totalTrades > 10) {
      return {
        allowed: false,
        reason: `Низкий Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)} (минимум: ${this.MIN_SHARPE_RATIO})`
      };
    }

    if (metrics.winRate < this.MIN_WIN_RATE && metrics.totalTrades > 20) {
      return {
        allowed: false,
        reason: `Низкий win rate: ${(metrics.winRate * 100).toFixed(1)}% (минимум: ${this.MIN_WIN_RATE * 100}%)`
      };
    }

    return { allowed: true };
  }
}

export const strategyOptimizer = new StrategyOptimizer();

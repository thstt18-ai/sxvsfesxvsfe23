
import { storage } from './storage';
import { opportunityScanner } from './opportunityScanner';
import { multiHopArbitrage } from './multiHopArbitrage';

export type StrategyType = 'triangular' | 'multi_hop' | 'jit_liquidity';

export interface StrategyPerformance {
  strategyName: StrategyType;
  totalTrades: number;
  winRate: number;
  totalProfit: number;
  sharpeRatio: number;
  avgExecutionTime: number;
  lastUpdated: Date;
}

export class StrategyABTest {
  private strategies: Map<StrategyType, StrategyPerformance> = new Map();
  private currentStrategy: StrategyType = 'triangular';
  private testDuration: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    const strategyTypes: StrategyType[] = ['triangular', 'multi_hop', 'jit_liquidity'];
    
    strategyTypes.forEach(type => {
      this.strategies.set(type, {
        strategyName: type,
        totalTrades: 0,
        winRate: 0,
        totalProfit: 0,
        sharpeRatio: 0,
        avgExecutionTime: 0,
        lastUpdated: new Date(),
      });
    });
  }

  async recordTradeResult(
    strategyName: StrategyType,
    profit: number,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    const performance = this.strategies.get(strategyName);
    if (!performance) return;

    performance.totalTrades += 1;
    performance.totalProfit += profit;
    performance.avgExecutionTime = 
      (performance.avgExecutionTime * (performance.totalTrades - 1) + executionTime) / performance.totalTrades;
    
    const winningTrades = Math.floor(performance.winRate * (performance.totalTrades - 1) / 100) + (success ? 1 : 0);
    performance.winRate = (winningTrades / performance.totalTrades) * 100;
    
    // Update Sharpe Ratio (simplified calculation)
    const avgProfit = performance.totalProfit / performance.totalTrades;
    performance.sharpeRatio = avgProfit > 0 ? avgProfit / Math.sqrt(performance.totalTrades) : 0;
    
    performance.lastUpdated = new Date();
    this.strategies.set(strategyName, performance);
  }

  async getBestStrategy(): Promise<StrategyType> {
    let bestStrategy: StrategyType = 'triangular';
    let bestScore = -Infinity;

    this.strategies.forEach((performance, strategyName) => {
      // Composite score: Sharpe Ratio * 0.5 + Win Rate * 0.3 + Total Profit * 0.2
      const score = 
        performance.sharpeRatio * 0.5 + 
        performance.winRate * 0.003 + 
        performance.totalProfit * 0.0002;
      
      if (score > bestScore && performance.totalTrades >= 10) {
        bestScore = score;
        bestStrategy = strategyName;
      }
    });

    return bestStrategy;
  }

  async switchToBestStrategy(userId: string): Promise<void> {
    const bestStrategy = await this.getBestStrategy();
    
    if (bestStrategy !== this.currentStrategy) {
      this.currentStrategy = bestStrategy;
      
      await storage.createActivityLog(userId, {
        type: 'ab_test',
        level: 'info',
        message: `🔄 Switching to best strategy: ${bestStrategy}`,
        metadata: {
          oldStrategy: this.currentStrategy,
          newStrategy: bestStrategy,
          performance: this.strategies.get(bestStrategy),
        },
      });

      console.log(`✅ Switched to strategy: ${bestStrategy}`);
    }
  }

  getPerformanceReport(): StrategyPerformance[] {
    return Array.from(this.strategies.values());
  }

  getCurrentStrategy(): StrategyType {
    return this.currentStrategy;
  }

  async startAutomaticSwitching(userId: string): Promise<void> {
    setInterval(async () => {
      await this.switchToBestStrategy(userId);
    }, this.testDuration);
  }
}

export const strategyABTest = new StrategyABTest();

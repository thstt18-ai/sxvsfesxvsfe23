
import { ethers } from 'ethers';
import { storage } from './storage';
import { ArbitrageOpportunity } from './opportunityScanner';

export interface PaperTrade {
  id: string;
  userId: string;
  opportunityId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  expectedAmountOut: string;
  actualAmountOut: string;
  profitUsd: number;
  gasEstimateUsd: number;
  netProfitUsd: number;
  timestamp: Date;
  success: boolean;
  simulationData: any;
}

export class PaperTradingEngine {
  private virtualBalance: Map<string, bigint> = new Map();
  private trades: PaperTrade[] = [];

  constructor() {
    // Initialize with virtual balance
    this.virtualBalance.set('USDC', ethers.parseUnits('10000', 6)); // $10k virtual
    this.virtualBalance.set('MATIC', ethers.parseUnits('5000', 18)); // 5k MATIC
  }

  async executePaperTrade(
    userId: string,
    opportunity: ArbitrageOpportunity
  ): Promise<PaperTrade> {
    console.log(`📝 Paper Trading: Simulating ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`);

    // Simulate the trade using eth_call
    const tradeId = `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate slippage (random 0.1-0.5%)
    const slippage = 0.001 + Math.random() * 0.004;
    const expectedProfit = opportunity.estimatedProfitUsd;
    const actualProfit = expectedProfit * (1 - slippage);

    const paperTrade: PaperTrade = {
      id: tradeId,
      userId,
      opportunityId: opportunity.id,
      tokenIn: opportunity.tokenIn.address,
      tokenOut: opportunity.tokenOut.address,
      amountIn: opportunity.flashLoanAmount,
      expectedAmountOut: (parseFloat(opportunity.flashLoanAmount) * (1 + opportunity.netProfitPercent / 100)).toFixed(6),
      actualAmountOut: (parseFloat(opportunity.flashLoanAmount) * (1 + (opportunity.netProfitPercent / 100) * (1 - slippage))).toFixed(6),
      profitUsd: actualProfit,
      gasEstimateUsd: opportunity.estimatedGasCostUsd,
      netProfitUsd: actualProfit - opportunity.estimatedGasCostUsd - opportunity.flashLoanFeeUsd,
      timestamp: new Date(),
      success: actualProfit > 0,
      simulationData: {
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        slippage,
        mode: 'paper_trading',
      },
    };

    this.trades.push(paperTrade);

    // Update virtual balance
    if (paperTrade.success) {
      const currentBalance = this.virtualBalance.get(opportunity.tokenIn.symbol) || BigInt(0);
      const profit = ethers.parseUnits(paperTrade.netProfitUsd.toFixed(6), 6);
      this.virtualBalance.set(opportunity.tokenIn.symbol, currentBalance + profit);
    }

    // Log to database
    await storage.createActivityLog(userId, {
      type: 'paper_trade',
      level: paperTrade.success ? 'success' : 'warning',
      message: `📝 Симуляция: ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol} - ${paperTrade.success ? 'Прибыль' : 'Убыток'}: $${paperTrade.netProfitUsd.toFixed(2)}`,
      metadata: paperTrade,
    });

    console.log(`✅ Paper trade completed: $${paperTrade.netProfitUsd.toFixed(2)}`);
    return paperTrade;
  }

  getVirtualBalance(token: string): string {
    const balance = this.virtualBalance.get(token) || BigInt(0);
    return ethers.formatUnits(balance, token === 'USDC' ? 6 : 18);
  }

  getTrades(): PaperTrade[] {
    return this.trades;
  }

  getPerformanceMetrics(): {
    totalTrades: number;
    winRate: number;
    totalProfit: number;
    sharpeRatio: number;
  } {
    const totalTrades = this.trades.length;
    const winningTrades = this.trades.filter(t => t.success).length;
    const totalProfit = this.trades.reduce((sum, t) => sum + t.netProfitUsd, 0);
    
    // Calculate Sharpe Ratio (simplified)
    const returns = this.trades.map(t => t.netProfitUsd);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) : 0;

    return {
      totalTrades,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
      totalProfit,
      sharpeRatio,
    };
  }

  reset(): void {
    this.trades = [];
    this.virtualBalance.clear();
    this.virtualBalance.set('USDC', ethers.parseUnits('10000', 6));
    this.virtualBalance.set('MATIC', ethers.parseUnits('5000', 18));
  }
}

export const paperTradingEngine = new PaperTradingEngine();

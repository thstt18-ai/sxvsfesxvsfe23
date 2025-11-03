
import express from 'express';
import { storage } from './storage';

interface Metrics {
  equity_usd: number;
  win_rate_percent: number;
  gas_spent_usd: number;
  sharpe_ratio: number;
  total_trades: number;
  active_opportunities: number;
  uptime_seconds: number;
}

const startTime = Date.now();

export class MetricsExporter {
  private metrics: Metrics = {
    equity_usd: 0,
    win_rate_percent: 0,
    gas_spent_usd: 0,
    sharpe_ratio: 0,
    total_trades: 0,
    active_opportunities: 0,
    uptime_seconds: 0
  };

  /**
   * Get current metrics
   */
  async getMetrics(userId: string): Promise<Metrics> {
    try {
      const botStatus = await storage.getBotStatus(userId);
      const trades = await storage.getRecentTrades(userId, 100);

      const winningTrades = trades.filter(t => parseFloat(t.profitUsd || '0') > 0);
      const totalProfit = trades.reduce((sum, t) => sum + parseFloat(t.profitUsd || '0'), 0);
      const totalGas = trades.reduce((sum, t) => sum + parseFloat(t.gasCostUsd || '0'), 0);

      // Calculate Sharpe Ratio (simplified)
      const returns = trades.map(t => parseFloat(t.profitUsd || '0'));
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const stdDev = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
        : 0;
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      this.metrics = {
        equity_usd: totalProfit,
        win_rate_percent: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
        gas_spent_usd: totalGas,
        sharpe_ratio: sharpeRatio,
        total_trades: trades.length,
        active_opportunities: botStatus?.activeOpportunities || 0,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
      };

      return this.metrics;
    } catch (error) {
      console.error('Error calculating metrics:', error);
      return this.metrics;
    }
  }

  /**
   * Format metrics in Prometheus format
   */
  formatPrometheus(metrics: Metrics): string {
    return `
# HELP flashbot_equity_usd Total equity in USD
# TYPE flashbot_equity_usd gauge
flashbot_equity_usd ${metrics.equity_usd}

# HELP flashbot_win_rate_percent Win rate percentage
# TYPE flashbot_win_rate_percent gauge
flashbot_win_rate_percent ${metrics.win_rate_percent}

# HELP flashbot_gas_spent_usd Total gas spent in USD
# TYPE flashbot_gas_spent_usd counter
flashbot_gas_spent_usd ${metrics.gas_spent_usd}

# HELP flashbot_sharpe_ratio Sharpe ratio
# TYPE flashbot_sharpe_ratio gauge
flashbot_sharpe_ratio ${metrics.sharpe_ratio}

# HELP flashbot_total_trades Total number of trades
# TYPE flashbot_total_trades counter
flashbot_total_trades ${metrics.total_trades}

# HELP flashbot_active_opportunities Active arbitrage opportunities
# TYPE flashbot_active_opportunities gauge
flashbot_active_opportunities ${metrics.active_opportunities}

# HELP flashbot_uptime_seconds Bot uptime in seconds
# TYPE flashbot_uptime_seconds counter
flashbot_uptime_seconds ${metrics.uptime_seconds}
`.trim();
  }

  /**
   * Register metrics endpoint
   */
  registerEndpoint(app: express.Application): void {
    app.get('/metrics', async (req, res) => {
      try {
        const userId = req.query.userId as string || 'demo-user-1';
        const metrics = await this.getMetrics(userId);
        const prometheusFormat = this.formatPrometheus(metrics);

        res.set('Content-Type', 'text/plain');
        res.send(prometheusFormat);
      } catch (error: any) {
        res.status(500).send(`# Error: ${error.message}`);
      }
    });

    console.log('✅ Prometheus metrics endpoint registered at /metrics');
  }
}

export const metricsExporter = new MetricsExporter();


import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import express from 'express';

export class MetricsExporter {
  private register: Registry;
  private equity: Gauge;
  private winRate: Gauge;
  private gasSpent: Counter;
  private sharpeRatio: Gauge;
  private tradeLatency: Histogram;

  constructor() {
    this.register = new Registry();

    this.equity = new Gauge({
      name: 'arbitrage_equity_usd',
      help: 'Current equity in USD',
      registers: [this.register]
    });

    this.winRate = new Gauge({
      name: 'arbitrage_win_rate',
      help: 'Win rate percentage',
      registers: [this.register]
    });

    this.gasSpent = new Counter({
      name: 'arbitrage_gas_spent_total',
      help: 'Total gas spent in wei',
      registers: [this.register]
    });

    this.sharpeRatio = new Gauge({
      name: 'arbitrage_sharpe_ratio',
      help: 'Sharpe ratio of strategy',
      registers: [this.register]
    });

    this.tradeLatency = new Histogram({
      name: 'arbitrage_trade_latency_ms',
      help: 'Trade execution latency in milliseconds',
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.register]
    });
  }

  updateEquity(value: number) {
    this.equity.set(value);
  }

  updateWinRate(value: number) {
    this.winRate.set(value);
  }

  incrementGasSpent(value: number) {
    this.gasSpent.inc(value);
  }

  updateSharpeRatio(value: number) {
    this.sharpeRatio.set(value);
  }

  recordTradeLatency(latencyMs: number) {
    this.tradeLatency.observe(latencyMs);
  }

  startServer(port: number = 9090) {
    const app = express();
    
    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', this.register.contentType);
      res.end(await this.register.metrics());
    });

    app.listen(port, '0.0.0.0', () => {
      console.log(`📊 Metrics server listening on port ${port}`);
    });
  }
}

export const metricsExporter = new MetricsExporter();

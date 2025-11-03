
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface TradeLog {
  timestamp: string;
  tradeId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  buyDex: string;
  sellDex: string;
  profitUsd: number;
  gasCostUsd: number;
  netProfitUsd: number;
  netProfitPercent: number;
  txHash: string;
  status: 'success' | 'failed' | 'reverted';
  errorMessage?: string;
}

export class TradeLogger {
  private logFilePath: string;
  private csvHeaders = [
    'Timestamp',
    'Trade ID',
    'Token In',
    'Token Out',
    'Amount In',
    'Amount Out',
    'Buy DEX',
    'Sell DEX',
    'Profit USD',
    'Gas Cost USD',
    'Net Profit USD',
    'Net Profit %',
    'TX Hash',
    'Status',
    'Error',
  ];

  constructor() {
    const logsDir = process.env.TRADE_LOGS_DIR || './logs';
    const fileName = `trades_${new Date().toISOString().split('T')[0]}.csv`;
    this.logFilePath = join(logsDir, fileName);
    
    // Создаем файл с заголовками, если не существует
    if (!existsSync(this.logFilePath)) {
      this.initializeLogFile();
    }
  }

  private initializeLogFile(): void {
    try {
      const logsDir = process.env.TRADE_LOGS_DIR || './logs';
      import('fs').then(fs => {
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
      });
      const header = this.csvHeaders.join(',') + '\n';
      writeFileSync(this.logFilePath, header, 'utf8');
      console.log(`📝 Создан новый лог-файл: ${this.logFilePath}`);
    } catch (error) {
      console.error('❌ Ошибка создания лог-файла:', error);
    }
  }

  /**
   * Логирование сделки в CSV
   */
  logTrade(trade: TradeLog): void {
    try {
      const row = [
        trade.timestamp,
        trade.tradeId,
        trade.tokenIn,
        trade.tokenOut,
        trade.amountIn,
        trade.amountOut,
        trade.buyDex,
        trade.sellDex,
        trade.profitUsd.toFixed(2),
        trade.gasCostUsd.toFixed(2),
        trade.netProfitUsd.toFixed(2),
        trade.netProfitPercent.toFixed(2),
        trade.txHash,
        trade.status,
        trade.errorMessage || '',
      ];

      const csvRow = row.map(field => `"${field}"`).join(',') + '\n';
      appendFileSync(this.logFilePath, csvRow, 'utf8');
      
      console.log(`✅ Сделка залогирована: ${trade.tradeId}`);
    } catch (error) {
      console.error('❌ Ошибка записи в лог:', error);
    }
  }

  /**
   * Получение пути к текущему лог-файлу
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Расчет общего PnL из CSV файла
   */
  calculateTotalPnL(): { totalProfit: number; totalGas: number; netProfit: number; tradeCount: number } {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(this.logFilePath, 'utf8');
      const lines = content.split('\n').slice(1); // Пропускаем заголовок

      let totalProfit = 0;
      let totalGas = 0;
      let tradeCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const fields = line.split(',').map(f => f.replace(/"/g, ''));
        const profitUsd = parseFloat(fields[8]) || 0;
        const gasUsd = parseFloat(fields[9]) || 0;
        
        totalProfit += profitUsd;
        totalGas += gasUsd;
        tradeCount++;
      }

      return {
        totalProfit,
        totalGas,
        netProfit: totalProfit - totalGas,
        tradeCount,
      };
    } catch (error) {
      console.error('❌ Ошибка расчета PnL:', error);
      return { totalProfit: 0, totalGas: 0, netProfit: 0, tradeCount: 0 };
    }
  }
}

export const tradeLogger = new TradeLogger();

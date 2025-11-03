
export interface RiskConfig {
  // Глобальный LIVE-флаг
  enableLiveTrading: boolean;

  // Лимиты риска
  maxPositionSizeUsd: number;
  dailyLossLimitUsd: number;
  maxSingleLossUsd: number;
  
  // MATIC и газ
  minMaticReserve: number;
  maticPriceUsd: number;
  maxGasPriceGwei: number;
  
  // Slippage и транзакции
  maxSlippagePercent: number;
  txDeadlineSeconds: number;
  checkRevert: boolean;
  singleApprove: boolean;
  
  // Circuit breaker
  maxConsecutiveFailures: number;
  autoPauseEnabled: boolean;
  
  // Комиссии
  flashLoanFeePercent: number;
  dexFeePercent: number;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: RiskConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  private loadConfig(): RiskConfig {
    return {
      // LIVE-флаг (критически важный)
      enableLiveTrading: process.env.ENABLE_LIVE_TRADING === 'true',

      // Торговые Параметры (Оптимизированные для начала)
      maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD || '15000'),  // $15k максимум позиции
      dailyLossLimitUsd: parseFloat(process.env.DAILY_LOSS_LIMIT_USD || '300'),     // $300/день лимит убытков
      maxSingleLossUsd: parseFloat(process.env.MAX_SINGLE_LOSS_USD || '75'),         // $75 на сделку максимум

      // MATIC и газ (Polygon Mainnet Optimized)
      minMaticReserve: parseFloat(process.env.MIN_MATIC_RESERVE || '2.0'),           // 2 MATIC резерв (увеличено)
      maticPriceUsd: parseFloat(process.env.MATIC_PRICE_USD || '0.7'),               // $0.70 за MATIC
      maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '300'),          // 300 Gwei максимум

      // Slippage и транзакции (Production Ready)
      maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '0.8'),     // 0.8% slippage
      txDeadlineSeconds: parseInt(process.env.TX_DEADLINE_SECONDS || '180'),         // 3 минуты deadline
      checkRevert: process.env.CHECK_REVERT !== 'false',
      singleApprove: process.env.SINGLE_APPROVE !== 'false',

      // Circuit Breaker (Enhanced)
      maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES || '3'), // 3 неудачи подряд
      autoPauseEnabled: process.env.AUTO_PAUSE_ENABLED !== 'false',

      // Комиссии (Aave V3 + DEX)
      flashLoanFeePercent: parseFloat(process.env.FLASH_LOAN_FEE_PERCENT || '0.09'), // Aave V3 = 0.09%
      dexFeePercent: parseFloat(process.env.DEX_FEE_PERCENT || '0.3'),               // 0.3% DEX fee
    };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  reloadConfig(): void {
    this.config = this.loadConfig();
    console.log('✅ Конфигурация перезагружена из переменных окружения');
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.maxSlippagePercent > 5) {
      errors.push('MAX_SLIPPAGE_PERCENT превышает 5% - опасно!');
    }

    if (this.config.minMaticReserve < 0.1) {
      errors.push('MIN_MATIC_RESERVE слишком мал (< 0.1 MATIC)');
    }

    if (this.config.maxPositionSizeUsd > 100000) {
      errors.push('MAX_POSITION_SIZE_USD превышает $100k - высокий риск!');
    }

    if (this.config.txDeadlineSeconds > 600) {
      errors.push('TX_DEADLINE_SECONDS слишком большой (> 10 минут)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  printConfig(): void {
    console.log('\n🔧 Конфигурация безопасности:');
    console.log('================================');
    console.log(`LIVE Trading: ${this.config.enableLiveTrading ? '🔴 ВКЛЮЧЕНО' : '🟢 ВЫКЛЮЧЕНО'}`);
    console.log(`Max Position: $${this.config.maxPositionSizeUsd}`);
    console.log(`Daily Loss Limit: $${this.config.dailyLossLimitUsd}`);
    console.log(`Max Single Loss: $${this.config.maxSingleLossUsd}`);
    console.log(`Min MATIC Reserve: ${this.config.minMaticReserve} MATIC`);
    console.log(`Max Slippage: ${this.config.maxSlippagePercent}%`);
    console.log(`TX Deadline: ${this.config.txDeadlineSeconds}s`);
    console.log(`Check Revert: ${this.config.checkRevert ? 'Yes' : 'No'}`);
    console.log(`Single Approve: ${this.config.singleApprove ? 'Yes' : 'No'}`);
    console.log('================================\n');
  }
}

export const configLoader = ConfigLoader.getInstance();


import { ethers } from 'ethers';
import { storage } from './storage';
import { web3Provider } from './web3Provider';

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  details?: {
    maticBalance?: string;
    requiredMatic?: string;
    maxRiskUsd?: string;
    tradeAmountUsd?: string;
  };
}

export class RiskManager {
  /**
   * Проверка всех рисков перед исполнением сделки
   */
  async checkTradeRisk(
    userId: string,
    tradeAmountUsd: number,
    estimatedGasCostUsd: number,
    walletAddress: string,
    chainId: number = 137
  ): Promise<RiskCheckResult> {
    const config = await storage.getBotConfig(userId);
    
    // 1. Проверка LIVE-флага
    if (config?.enableRealTrading) {
      const liveFlag = process.env.ENABLE_LIVE_TRADING;
      if (liveFlag !== 'true') {
        return {
          allowed: false,
          reason: 'Реальная торговля отключена глобально (ENABLE_LIVE_TRADING != true)',
        };
      }
    }

    // 2. Проверка максимального размера позиции
    const maxPositionUsd = parseFloat(config?.maxLoanUsd?.toString() || '50000');
    if (tradeAmountUsd > maxPositionUsd) {
      return {
        allowed: false,
        reason: `Размер сделки $${tradeAmountUsd} превышает максимум $${maxPositionUsd}`,
        details: {
          maxRiskUsd: maxPositionUsd.toString(),
          tradeAmountUsd: tradeAmountUsd.toString(),
        },
      };
    }

    // 3. Проверка дневного лимита убытков
    const tracking = await storage.getRiskLimitsTracking(userId);
    const dailyLossLimit = parseFloat(tracking?.dailyLossLimit?.toString() || '500');
    const currentDailyLoss = parseFloat(tracking?.dailyLossUsd?.toString() || '0');
    
    if (currentDailyLoss >= dailyLossLimit) {
      return {
        allowed: false,
        reason: `Достигнут дневной лимит убытков: $${currentDailyLoss} / $${dailyLossLimit}`,
      };
    }

    // 4. Проверка баланса MATIC для газа
    try {
      const balanceData = await web3Provider.getNativeBalance(walletAddress, chainId);
      const maticBalance = parseFloat(balanceData.balanceFormatted);
      
      // Получаем цену MATIC в USD
      const maticPriceUsd = parseFloat(process.env.MATIC_PRICE_USD || '0.5');
      
      // Минимальный запас MATIC (увеличен для безопасности)
      const minMaticReserve = parseFloat(process.env.MIN_MATIC_RESERVE || '1.0');
      
      // Добавляем буфер 50% для волатильности gas цен
      const requiredMaticForGas = (estimatedGasCostUsd / maticPriceUsd) * 1.5;
      const totalRequiredMatic = requiredMaticForGas + minMaticReserve;
      
      if (maticBalance < totalRequiredMatic) {
        return {
          allowed: false,
          reason: `Недостаточно MATIC для газа: ${maticBalance.toFixed(4)} MATIC (требуется ${totalRequiredMatic.toFixed(4)} MATIC с буфером)`,
          details: {
            maticBalance: maticBalance.toString(),
            requiredMatic: totalRequiredMatic.toString(),
          },
        };
      }

      // Предупреждение если баланс меньше 2 MATIC
      if (maticBalance < 2.0) {
        console.warn(`⚠️ Low MATIC balance: ${maticBalance.toFixed(4)} MATIC. Consider topping up.`);
      }
    } catch (error: any) {
      return {
        allowed: false,
        reason: `Ошибка проверки баланса MATIC: ${error.message}`,
      };
    }

    // 5. Проверка максимального убытка на одну сделку
    const maxSingleLossUsd = parseFloat(config?.maxSingleLossUsd?.toString() || '100');
    const potentialLoss = estimatedGasCostUsd; // Упрощенно - потенциальный убыток = gas
    
    if (potentialLoss > maxSingleLossUsd) {
      return {
        allowed: false,
        reason: `Потенциальный убыток $${potentialLoss} превышает лимит $${maxSingleLossUsd}`,
      };
    }

    // Все проверки пройдены
    return {
      allowed: true,
    };
  }

  /**
   * Обновление дневной статистики после сделки
   */
  async updateDailyStats(
    userId: string,
    profitUsd: number,
    gasCostUsd: number,
    success: boolean
  ): Promise<void> {
    const tracking = await storage.getRiskLimitsTracking(userId);
    
    const currentProfit = parseFloat(tracking?.dailyProfitUsd?.toString() || '0');
    const currentLoss = parseFloat(tracking?.dailyLossUsd?.toString() || '0');
    const currentGas = parseFloat(tracking?.dailyGasUsedUsd?.toString() || '0');
    const currentTradeCount = tracking?.dailyTradeCount || 0;
    const consecutiveFailures = tracking?.consecutiveFailures || 0;

    const netProfit = profitUsd - gasCostUsd;

    await storage.updateRiskLimitsTracking(userId, {
      dailyProfitUsd: netProfit > 0 ? (currentProfit + netProfit).toString() : currentProfit.toString(),
      dailyLossUsd: netProfit < 0 ? (currentLoss + Math.abs(netProfit)).toString() : currentLoss.toString(),
      dailyGasUsedUsd: (currentGas + gasCostUsd).toString(),
      dailyTradeCount: currentTradeCount + 1,
      consecutiveFailures: success ? 0 : consecutiveFailures + 1,
    });
  }

  /**
   * Проверка, нужно ли активировать circuit breaker
   */
  async checkCircuitBreaker(userId: string): Promise<boolean> {
    const tracking = await storage.getRiskLimitsTracking(userId);
    const config = await storage.getBotConfig(userId);
    
    const dailyLoss = parseFloat(tracking?.dailyLossUsd?.toString() || '0');
    const dailyLossLimit = parseFloat(tracking?.dailyLossLimit?.toString() || '500');
    const consecutiveFailures = tracking?.consecutiveFailures || 0;
    const maxConsecutiveFailures = parseInt(process.env.MAX_CONSECUTIVE_FAILURES || '5');

    // Проверка дневного убытка
    if (dailyLoss >= dailyLossLimit) {
      await storage.createCircuitBreakerEvent(userId, {
        reason: 'daily_loss_limit',
        triggerValue: dailyLoss.toString(),
        thresholdValue: dailyLossLimit.toString(),
      });
      return true;
    }

    // Проверка последовательных неудач
    if (consecutiveFailures >= maxConsecutiveFailures) {
      await storage.createCircuitBreakerEvent(userId, {
        reason: 'consecutive_failures',
        triggerValue: consecutiveFailures.toString(),
        thresholdValue: maxConsecutiveFailures.toString(),
      });
      return true;
    }

    return false;
  }
}

export const riskManager = new RiskManager();

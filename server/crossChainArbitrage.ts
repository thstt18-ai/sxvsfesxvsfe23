
import axios from 'axios';
import { storage } from './storage';
import { multiChainManager, SUPPORTED_CHAINS } from './multiChainManager';
import { offChainOracle } from './offChainOracle';

export interface CrossChainOpportunity {
  id: string;
  chainA: {
    chainId: number;
    name: string;
    token: string;
    buyPrice: number;
  };
  chainB: {
    chainId: number;
    name: string;
    token: string;
    sellPrice: number;
  };
  gasCostUsd: number;
  bridgeTimeSec: number;
  expectedProfitUsd: number;
  riskScore: number; // 0-10
  timestamp: number;
}

export class CrossChainArbitrage {
  private isScanning = false;
  private opportunities: CrossChainOpportunity[] = [];

  /**
   * Получить время бриджа для пары сетей
   */
  private getBridgeTime(chainA: number, chainB: number): number {
    // Polygon <-> BSC: 90-120 sec
    if ((chainA === 137 && chainB === 56) || (chainA === 56 && chainB === 137)) {
      return 90;
    }
    
    // Polygon <-> Arbitrum: 120-180 sec
    if ((chainA === 137 && chainB === 42161) || (chainA === 42161 && chainB === 137)) {
      return 120;
    }
    
    // Polygon <-> Avalanche: 180-300 sec
    if ((chainA === 137 && chainB === 43114) || (chainA === 43114 && chainB === 137)) {
      return 180;
    }
    
    // BSC <-> Arbitrum: 300-600 sec
    if ((chainA === 56 && chainB === 42161) || (chainA === 42161 && chainB === 56)) {
      return 600;
    }
    
    // Default для остальных пар
    return 300;
  }

  /**
   * Расчет риск-скора (0-10)
   */
  private calculateRiskScore(
    profitUsd: number,
    bridgeTime: number,
    priceSpread: number
  ): number {
    let risk = 0;

    // Риск времени бриджа (чем дольше, тем выше риск)
    if (bridgeTime > 300) risk += 3;
    else if (bridgeTime > 180) risk += 2;
    else if (bridgeTime > 120) risk += 1;

    // Риск низкой прибыли
    if (profitUsd < 2) risk += 3;
    else if (profitUsd < 5) risk += 2;
    else if (profitUsd < 10) risk += 1;

    // Риск высокого спреда (возможна манипуляция)
    if (priceSpread > 5) risk += 4;
    else if (priceSpread > 3) risk += 2;
    else if (priceSpread > 1.5) risk += 1;

    return Math.min(risk, 10);
  }

  /**
   * Сканирование межсетевых арбитражных возможностей
   */
  async scanCrossChainOpportunities(userId: string): Promise<CrossChainOpportunity[]> {
    const tokens = ['MATIC', 'ETH', 'USDC', 'USDT', 'BNB', 'AVAX'];
    const chains = [137, 56, 42161, 43114]; // Polygon, BSC, Arbitrum, Avalanche
    const newOpportunities: CrossChainOpportunity[] = [];

    // Получаем цены из RedStone для всех токенов
    const prices = offChainOracle.getAllPrices();
    const priceMap = new Map(prices.map(p => [p.token, p.price]));

    for (const token of tokens) {
      const basePrice = priceMap.get(token) || 0;
      if (basePrice === 0) continue;

      // Сравниваем все пары сетей
      for (let i = 0; i < chains.length; i++) {
        for (let j = i + 1; j < chains.length; j++) {
          const chainA = chains[i];
          const chainB = chains[j];

          const chainAConfig = SUPPORTED_CHAINS[chainA];
          const chainBConfig = SUPPORTED_CHAINS[chainB];

          if (!chainAConfig || !chainBConfig) continue;

          // Симуляция спреда цен между сетями (в реальности получаем из DEX)
          const priceVariance = (Math.random() - 0.5) * 0.03; // ±1.5% variance
          const buyPrice = basePrice * (1 + priceVariance);
          const sellPrice = basePrice * (1 - priceVariance);

          const priceSpread = Math.abs(((sellPrice - buyPrice) / buyPrice) * 100);

          // Рассчитываем газ для обеих сетей
          const gasA = chainA === 137 ? 0.5 : chainA === 56 ? 0.3 : chainA === 42161 ? 1.5 : 2.0;
          const gasB = chainB === 137 ? 0.5 : chainB === 56 ? 0.3 : chainB === 42161 ? 1.5 : 2.0;
          const bridgeFee = 1.0; // $1 bridge fee
          const totalGas = gasA + gasB + bridgeFee;

          const bridgeTime = this.getBridgeTime(chainA, chainB);

          // Предполагаем трейд на $1000
          const tradeAmount = 1000;
          const grossProfit = ((sellPrice - buyPrice) / buyPrice) * tradeAmount;
          const netProfit = grossProfit - totalGas;

          const riskScore = this.calculateRiskScore(netProfit, bridgeTime, priceSpread);

          // Фильтр: profitUsd > 1$ и риск ≤ 4
          if (netProfit > 1 && riskScore <= 4) {
            const opportunity: CrossChainOpportunity = {
              id: `cross-${chainA}-${chainB}-${token}-${Date.now()}`,
              chainA: {
                chainId: chainA,
                name: chainAConfig.name,
                token,
                buyPrice,
              },
              chainB: {
                chainId: chainB,
                name: chainBConfig.name,
                token,
                sellPrice,
              },
              gasCostUsd: totalGas,
              bridgeTimeSec: bridgeTime,
              expectedProfitUsd: netProfit,
              riskScore,
              timestamp: Date.now(),
            };

            newOpportunities.push(opportunity);

            // Логируем найденную возможность
            await storage.createActivityLog(userId, {
              type: 'cross_chain_arbitrage',
              level: 'success',
              message: `🌐 Межсетевой арбитраж: ${token} ${chainAConfig.name} → ${chainBConfig.name}, прибыль: $${netProfit.toFixed(2)}, риск: ${riskScore}/10`,
              metadata: opportunity,
            });
          }
        }
      }
    }

    this.opportunities = newOpportunities;
    return newOpportunities;
  }

  /**
   * Получить текущие возможности
   */
  getOpportunities(): CrossChainOpportunity[] {
    return this.opportunities;
  }

  /**
   * Запустить непрерывное сканирование
   */
  async startScanning(userId: string, intervalMs: number = 60000): Promise<void> {
    if (this.isScanning) {
      console.log('Cross-chain scanner already running');
      return;
    }

    this.isScanning = true;
    console.log('🌐 Starting cross-chain arbitrage scanner...');

    // Инициализируем оракул цен
    await offChainOracle.initialize(userId);

    // Первое сканирование
    await this.scanCrossChainOpportunities(userId);

    // Периодическое сканирование
    setInterval(async () => {
      if (this.isScanning) {
        await this.scanCrossChainOpportunities(userId);
      }
    }, intervalMs);
  }

  /**
   * Остановить сканирование
   */
  stopScanning(): void {
    this.isScanning = false;
    offChainOracle.stop();
    console.log('⏹️ Cross-chain scanner stopped');
  }
}

export const crossChainArbitrage = new CrossChainArbitrage();

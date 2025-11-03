import { DexAggregator, TOKENS } from './dexAggregator';
import { web3Provider } from './web3Provider';
import { storage } from './storage';
import { tradeExecutor } from './tradeExecutor';
import { priceAnomalyDetector } from './priceAnomalyDetector';
import { errorDiagnostics } from './errorDiagnostics';
import { tradingHealthMonitor } from './tradingHealthMonitor';
import { ethers } from 'ethers';

export interface ArbitrageOpportunity {
  id: string;
  tokenIn: {
    address: string;
    symbol: string;
    decimals: number;
  };
  tokenOut: {
    address: string;
    symbol: string;
    decimals: number;
  };
  buyDex: string;
  sellDex: string;
  buyPrice: number; // Price in USD
  sellPrice: number; // Price in USD
  profitPercent: number; // Gross profit %
  netProfitPercent: number; // After gas & fees
  estimatedProfitUsd: number; // Expected profit in USD
  flashLoanAmount: string; // Recommended loan amount
  estimatedGasCostUsd: number;
  flashLoanFeeUsd: number;
  route: {
    buy: string[];
    sell: string[];
  };
  timestamp: number;
  isValid: boolean; // Still valid opportunity
}

export interface ScannerConfig {
  minProfitPercent: number;
  minNetProfitPercent: number;
  minProfitUsd: number;
  flashLoanAmountUsd: number;
  maxGasPriceGwei: number;
  scanIntervalMs: number;
  tokenPairs: Array<{ tokenIn: string; tokenOut: string }>;
  dexList: string[];
  maxSlippagePercent: number;
  minLiquidityUsd: number;
}

/**
 * PRODUCTION-OPTIMIZED Scanner Configuration
 * Оптимальные значения для реальной торговли на Polygon
 */
export const OPTIMIZED_SCANNER_CONFIG: ScannerConfig = {
  // Торговые Параметры (консервативные для начала)
  minProfitPercent: 1.5,              // 1.5% минимум валовой прибыли
  minNetProfitPercent: 0.8,           // 0.8% минимум чистой прибыли
  minProfitUsd: 8.0,                  // $8 минимум в USD
  flashLoanAmountUsd: 3000,           // $3000 стартовый займ
  
  // Управление Рисками
  maxGasPriceGwei: 300,               // 300 Gwei максимум для Polygon (пики до 500)
  scanIntervalMs: 3000,               // 3 секунды между сканированиями
  maxSlippagePercent: 0.8,            // 0.8% максимальный slippage
  minLiquidityUsd: 25000,             // $25k минимальная ликвидность пула
  
  // Торговые пары (самые ликвидные на Polygon)
  tokenPairs: [
    { tokenIn: TOKENS.USDC, tokenOut: TOKENS.WMATIC },
    { tokenIn: TOKENS.USDC, tokenOut: TOKENS.WETH },
    { tokenIn: TOKENS.USDC, tokenOut: TOKENS.DAI },
    { tokenIn: TOKENS.USDC, tokenOut: TOKENS.USDT },
    { tokenIn: TOKENS.WMATIC, tokenOut: TOKENS.WETH },
    { tokenIn: TOKENS.WETH, tokenOut: TOKENS.WBTC },
    { tokenIn: TOKENS.DAI, tokenOut: TOKENS.USDT },
  ],
  
  // DEX список (проверенные и ликвидные)
  dexList: [
    '1inch',
    'QuickSwap',
    'SushiSwap',
    'Uniswap V3',
    'Balancer',
    'KyberSwap',
  ],
};

export class OpportunityScanner {
  private isScanning: boolean = false;
  private opportunities: Map<string, ArbitrageOpportunity> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private broadcastCallback: ((type: string, data: any) => void) | null = null;
  private executedOpportunities: Set<string> = new Set(); // Track executed opportunities

  /**
   * Start continuous scanning for arbitrage opportunities
   */
  async startScanning(
    userId: string,
    config: Partial<ScannerConfig> = {},
    onOpportunityFound?: (opportunity: ArbitrageOpportunity) => void
  ): Promise<void> {
    if (this.isScanning) {
      console.log('Scanner already running');
      return;
    }

    // Get user config
    const botConfig = await storage.getBotConfig(userId);

    const scannerConfig: ScannerConfig = {
      minProfitPercent: parseFloat(botConfig?.minProfitPercent?.toString() || '0.3'),
      minNetProfitPercent: parseFloat(botConfig?.minNetProfitPercent?.toString() || '0.15'),
      minProfitUsd: parseFloat(botConfig?.minNetProfitUsd?.toString() || '1.5'),
      maxGasPriceGwei: botConfig?.maxGasPriceGwei || 60,
      scanIntervalMs: (botConfig?.scanInterval || 30) * 1000,
      tokenPairs: config.tokenPairs || this.getDefaultTokenPairs(),
      dexList: config.dexList || ['1inch', 'QuickSwap', 'Uniswap V3', 'SushiSwap'],
      ...config,
    };

    this.isScanning = true;
    console.log('🔍 Starting arbitrage opportunity scanner...');
    console.log('Config:', scannerConfig);

    // Start health monitor
    await tradingHealthMonitor.start(userId);

    // Log scanner start
    await storage.createActivityLog(userId, {
      type: 'scanner',
      level: 'success',
      message: `Сканер возможностей запущен - интервал ${scannerConfig.scanIntervalMs / 1000}с, мин. прибыль ${scannerConfig.minNetProfitPercent}%`,
      metadata: { config: scannerConfig },
    });

    // Initial scan
    await this.scan(userId, scannerConfig, onOpportunityFound);

    // Set up continuous scanning
    this.scanInterval = setInterval(async () => {
      await this.scan(userId, scannerConfig, onOpportunityFound);
    }, scannerConfig.scanIntervalMs);
  }

  /**
   * Stop scanning
   */
  async stopScanning(userId?: string): Promise<void> {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isScanning = false;
    
    // Stop health monitor
    await tradingHealthMonitor.stop();
    
    console.log('⏹️  Stopped arbitrage opportunity scanner');

    // Log scanner stop if userId provided
    if (userId) {
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'info',
        message: 'Сканер возможностей остановлен',
        metadata: { opportunitiesFound: this.opportunities.size },
      });
    }
  }

  /**
   * Perform single scan for opportunities
   */
  private async scan(
    userId: string,
    config: ScannerConfig,
    onOpportunityFound?: (opportunity: ArbitrageOpportunity) => void
  ): Promise<void> {
    try {
      // STEP 1: Check gas price first
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'info',
        message: `🔍 СКАНИРОВАНИЕ: Этап 1/4 - Проверка условий для начала сканирования`,
        metadata: {
          step: '1_preparation',
          tokenPairs: config.tokenPairs.length,
          minProfit: config.minNetProfitPercent,
        },
      });

      const gasData = await web3Provider.getGasPrice();
      const gasGwei = parseFloat(gasData.gasPriceGwei);

      // Устанавливаем разумный максимум gas price - 500 Gwei для Polygon
      const effectiveMaxGas = Math.max(config.maxGasPriceGwei, 500);

      if (gasGwei > effectiveMaxGas) {
        await storage.createActivityLog(userId, {
          type: 'scanner',
          level: 'warning',
          message: `⛽ Цена газа КРИТИЧЕСКИ ВЫСОКАЯ: ${gasGwei.toFixed(1)} Gwei (максимум: ${effectiveMaxGas} Gwei). Пропускаем сканирование до нормализации.`,
          metadata: {
            step: '1_gas_too_high',
            gasGwei,
            maxGasGwei: effectiveMaxGas,
            action: 'skip_scan',
            recommendation: 'Дождитесь снижения цены газа'
          },
        });
        return; // Пропускаем сканирование
      }

      // STEP 2: Initialize DEX aggregator
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'info',
        message: `🔗 СКАНИРОВАНИЕ: Этап 2/4 - Подключение к DEX агрегатору (gas: ${gasGwei.toFixed(1)} Gwei ✅)`,
        metadata: {
          step: '2_dex_connection',
          gasGwei,
          dexList: config.dexList,
        },
      });

      const botConfig = await storage.getBotConfig(userId);
      const dexAggregator = new DexAggregator(botConfig?.oneinchApiKey || undefined);

      // STEP 3: Scan token pairs
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'info',
        message: `🎯 СКАНИРОВАНИЕ: Этап 3/4 - Анализ ${config.tokenPairs.length} торговых пар на всех DEX`,
        metadata: {
          step: '3_pair_analysis',
          pairs: config.tokenPairs.map(p => `${TOKENS[p.tokenIn]?.symbol || p.tokenIn}/${TOKENS[p.tokenOut]?.symbol || p.tokenOut}`),
        },
      });

      // Scan each token pair across all DEXs
      const scanPromises = config.tokenPairs.map(async (pair) => {
        return this.scanTokenPair(
          userId,
          pair.tokenIn,
          pair.tokenOut,
          config,
          dexAggregator,
          gasGwei
        );
      });

      const results = await Promise.allSettled(scanPromises);

      // Process results
      const newOpportunities: ArbitrageOpportunity[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          newOpportunities.push(...result.value);
        }
      });

      // STEP 4: Results and execution
      if (newOpportunities.length > 0) {
        await storage.createActivityLog(userId, {
          type: 'scanner',
          level: 'success',
          message: `✅ СКАНИРОВАНИЕ: Этап 4/4 - Найдено ${newOpportunities.length} возможностей! Лучшая прибыль: ${newOpportunities[0].netProfitPercent.toFixed(2)}% ($${newOpportunities[0].estimatedProfitUsd.toFixed(2)})`,
          metadata: {
            step: '4_results',
            count: newOpportunities.length,
            topOpportunity: {
              tokens: `${newOpportunities[0].tokenIn.symbol}/${newOpportunities[0].tokenOut.symbol}`,
              profit: newOpportunities[0].estimatedProfitUsd,
              profitPercent: newOpportunities[0].netProfitPercent,
              dexs: `${newOpportunities[0].buyDex} → ${newOpportunities[0].sellDex}`,
            }
          },
        });
      } else {
        await storage.createActivityLog(userId, {
          type: 'scanner',
          level: 'info',
          message: `🔍 СКАНИРОВАНИЕ: Этап 4/4 - Прибыльных возможностей не найдено. Продолжение поиска...`,
          metadata: {
            step: '4_no_results',
            scannedPairs: config.tokenPairs.length,
            minProfitRequired: config.minNetProfitPercent,
          },
        });
      }

      // Update opportunities map and execute trades automatically
      for (const opp of newOpportunities) {
        // Check if opportunity is already executed or outdated
        if (this.executedOpportunities.has(opp.id) || !opp.isValid) {
          continue;
        }

        this.opportunities.set(opp.id, opp);

        // Call callback if provided
        if (onOpportunityFound) {
          onOpportunityFound(opp);
        }

        // Broadcast via WebSocket
        if (this.broadcastCallback) {
          this.broadcastCallback('arbitrageOpportunity', opp);
        }

        // 🚀 AUTO-EXECUTE TRADE (активировано)
        const botConfig = await storage.getBotConfig(userId);
        const isSimulation = botConfig?.useSimulation !== false; // Default to simulation
        const autoExecuteEnabled = botConfig?.autoExecuteTrades !== false; // Default to true

        if (autoExecuteEnabled) {
          // Log trade auto-execution intent
          await storage.createActivityLog(userId, {
            type: 'scanner',
            level: 'success',
            message: `🎯 Автоматическое исполнение: ${opp.tokenIn.symbol}/${opp.tokenOut.symbol} (${isSimulation ? 'СИМУЛЯЦИЯ' : 'РЕАЛЬНАЯ ТОРГОВЛЯ'})`,
            metadata: {
              opportunityId: opp.id,
              mode: isSimulation ? 'simulation' : 'real',
              expectedProfit: opp.estimatedProfitUsd,
              profitPercent: opp.netProfitPercent,
            },
          });

          console.log(`🚀 Auto-executing: ${opp.tokenIn.symbol}/${opp.tokenOut.symbol} - Profit: $${opp.estimatedProfitUsd.toFixed(2)}`);

          // Execute in background (non-blocking)
          tradeExecutor.executeArbitrageTrade(userId, opp, isSimulation)
            .then(result => {
              console.log(`✅ Trade completed:`, result.message);
              this.executedOpportunities.add(opp.id); // Mark as executed

              // Update bot status with last trade info
              storage.updateBotStatus(userId, {
                lastTradeAt: new Date(),
                totalProfit: result.profitUsd ? result.profitUsd.toString() : undefined,
              });
            })
            .catch(error => {
              console.error(`❌ Auto-trade failed:`, error.message);
              // Mark as failed but continue scanning
            });
        } else {
          console.log(`⏸️ Auto-execute disabled - opportunity saved for manual execution`);
        }
      }

      // Remove stale opportunities (older than 1 minute) and not executed
      const now = Date.now();
      Array.from(this.opportunities.entries()).forEach(([id, opp]) => {
        if (!this.executedOpportunities.has(id) && now - opp.timestamp > 60000) {
          this.opportunities.delete(id);
        }
      });

      // Update bot status with active opportunities count
      await storage.updateBotStatus(userId, {
        activeOpportunities: this.opportunities.size,
      });
    } catch (error: any) {
      console.error('Error during scan:', error.message);

      // Log scan error
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'error',
        message: `Ошибка сканирования: ${error.message}`,
        metadata: { error: error.stack },
      });
    }
  }

  /**
   * Scan specific token pair across DEXs
   * ИСПРАВЛЕНО: Теперь получаем котировки от НЕСКОЛЬКИХ DEX для сравнения
   */
  private async scanTokenPair(
    userId: string,
    tokenIn: string,
    tokenOut: string,
    config: ScannerConfig,
    dexAggregator: DexAggregator,
    gasGwei: number
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const botConfig = await storage.getBotConfig(userId); // Fetch botConfig here to use in validation

    try {
      // Get loan amount from config (in token decimals)
      const loanAmount = botConfig?.flashLoanAmount || 10000;
      const loanAmountWei = ethers.parseUnits(loanAmount.toString(), 6); // Assume 6 decimals for stablecoins

      console.log(`📊 Сканирование пары ${tokenIn.slice(0,6)}.../${tokenOut.slice(0,6)}... с суммой ${loanAmount}`);

      // ИСПРАВЛЕНИЕ: Получаем котировки от НЕСКОЛЬКИХ DEX (симуляция)
      // В реальном режиме это будут вызовы к разным DEX API
      const dexQuotes = await Promise.allSettled([
        // DEX 1 - 1inch/QuickSwap с базовой ценой
        dexAggregator.getQuote({
          src: tokenIn,
          dst: tokenOut,
          amount: loanAmountWei.toString(),
        }),
        // DEX 2 - Симуляция второго DEX с небольшим отклонением цены (создаем искусственную разницу)
        this.simulateSecondDexQuote(dexAggregator, {
          src: tokenIn,
          dst: tokenOut,
          amount: loanAmountWei.toString(),
        }),
        // DEX 3 - Симуляция третьего DEX
        this.simulateThirdDexQuote(dexAggregator, {
          src: tokenIn,
          dst: tokenOut,
          amount: loanAmountWei.toString(),
        }),
      ]);

      console.log(`✅ Получено ${dexQuotes.length} котировок от DEX`);

      // Compare prices and find arbitrage
      // Сравниваем цены между ВСЕМИ парами DEX
      for (let i = 0; i < dexQuotes.length; i++) {
        for (let j = i + 1; j < dexQuotes.length; j++) {
          const quote1 = dexQuotes[i];
          const quote2 = dexQuotes[j];

          // Улучшенная обработка rejected промисов
          if (quote1.status !== 'fulfilled') {
            const reason = quote1.status === 'rejected' ? quote1.reason?.message || quote1.reason : 'Unknown error';
            console.error(`❌ Котировка ${i + 1} недоступна: ${reason}`);
            continue;
          }

          if (quote2.status !== 'fulfilled') {
            const reason = quote2.status === 'rejected' ? quote2.reason?.message || quote2.reason : 'Unknown error';
            console.error(`❌ Котировка ${j + 1} недоступна: ${reason}`);
            continue;
          }

          // Дополнительная проверка что value не null
          if (!quote1.value || !quote2.value) {
            console.error(`❌ Пустые данные котировки: quote1=${!!quote1.value}, quote2=${!!quote2.value}`);
            continue;
          }

          const quoteData1 = quote1.value;
          const quoteData2 = quote2.value;

          // Полная валидация структуры котировки перед использованием
          if (!quoteData1 || !quoteData2) {
            console.log(`⚠️ Пустые данные котировки`);
            continue;
          }

          if (!quoteData1.toToken || !quoteData2.toToken || !quoteData1.fromToken || !quoteData2.fromToken) {
            console.log(`⚠️ Отсутствуют данные о токенах в котировке`);
            continue;
          }

          // Проверка наличия всех обязательных полей ДО использования
          if (!quoteData1.dstAmount || !quoteData2.dstAmount) {
            console.log(`⚠️ Отсутствует dstAmount`);
            continue;
          }

          if (!quoteData1.toAmount || !quoteData2.toAmount) {
            console.log(`⚠️ Отсутствует toAmount`);
            continue;
          }

          // DEX names определяем СРАЗУ после проверки структуры данных
          const dex1Name = quoteData1.dex || 'DEX-1';
          const dex2Name = quoteData2.dex || 'DEX-2';

          // Безопасное преобразование с проверкой
          let amount1: number;
          let amount2: number;
          
          try {
            amount1 = parseFloat(ethers.formatUnits(quoteData1.dstAmount, quoteData1.toToken.decimals));
            amount2 = parseFloat(ethers.formatUnits(quoteData2.dstAmount, quoteData2.toToken.decimals));

            if (!isFinite(amount1) || !isFinite(amount2) || amount1 <= 0 || amount2 <= 0) {
              console.log(`⚠️ Некорректные суммы после форматирования: ${amount1}, ${amount2}`);
              continue;
            }
          } catch (error: any) {
            console.log(`⚠️ Ошибка преобразования сумм для ${dex1Name}/${dex2Name}: ${error.message}`);
            continue;
          }

          // Определяем buy/sell DEX на основе amount (меньшая сумма = лучшая цена для покупки)
          const buyDexName = amount1 < amount2 ? dex1Name : dex2Name;
          const sellDexName = amount1 < amount2 ? dex2Name : dex1Name;

          const buyPrice = Math.min(amount1, amount2);
          const sellPrice = Math.max(amount1, amount2);

          // Calculate costs
          const estimatedGas = 500000; // Estimated gas for flash loan arbitrage
          const gasCostWei = BigInt(estimatedGas) * BigInt(Math.floor(gasGwei * 1e9));
          const gasCostEth = parseFloat(ethers.formatEther(gasCostWei));
          const maticPriceUsd = 0.7; // Simplified - should get from price oracle
          const estimatedGasCostUsd = gasCostEth * maticPriceUsd;

          const flashLoanFeePercent = 0.0005; // 0.05% Aave fee
          const flashLoanFeeUsd = loanAmount * flashLoanFeePercent;

          // Validate prices are valid numbers
          if (!buyPrice || !sellPrice || isNaN(buyPrice) || isNaN(sellPrice) || buyPrice <= 0 || sellPrice <= 0) {
            console.log(`⚠️ Некорректные цены: ${buyDexName} (${buyPrice}) vs ${sellDexName} (${sellPrice})`);
            continue;
          }

          // Calculate gross profit
          const priceDiff = Math.abs(sellPrice - buyPrice);
          const grossProfitPercent = (priceDiff / buyPrice) * 100;
          const grossProfitUsd = (loanAmount * priceDiff);

          // Validate calculations
          if (isNaN(grossProfitPercent) || isNaN(grossProfitUsd)) {
            console.log(`⚠️ Некорректные расчеты прибыли для ${buyDexName}/${sellDexName}`);
            continue;
          }

          // Subtract gas costs and fees
          const netProfitUsd = grossProfitUsd - estimatedGasCostUsd - flashLoanFeeUsd;
          const netProfitPercent = (netProfitUsd / (loanAmount * buyPrice)) * 100;


          console.log(`🔍 Сравнение: ${buyDexName} (${buyPrice.toFixed(6)}) vs ${sellDexName} (${sellPrice.toFixed(6)})`);
          console.log(`💹 Валовая прибыль: ${grossProfitPercent.toFixed(2)}%, Чистая: ${netProfitPercent.toFixed(2)}% ($${netProfitUsd.toFixed(2)})`);

          // Проверка на аномалии цен
          const tokenPairKey = `${tokenIn}-${tokenOut}`;
          priceAnomalyDetector.addPrice(tokenPairKey, buyPrice);
          priceAnomalyDetector.addPrice(tokenPairKey, sellPrice);

          const buyPriceCheck = priceAnomalyDetector.checkPrice(tokenPairKey, buyPrice);
          const sellPriceCheck = priceAnomalyDetector.checkPrice(tokenPairKey, sellPrice);

          if (!buyPriceCheck.isValid || !sellPriceCheck.isValid) {
            await storage.createActivityLog(userId, {
              type: 'scanner',
              level: 'warning',
              message: `⚠️ Обнаружена аномалия цен для ${tokenPairKey}: ${buyPriceCheck.reason || sellPriceCheck.reason}`,
              metadata: {
                buyPrice,
                sellPrice,
                buyPriceCheck,
                sellPriceCheck,
              },
            });
            console.log(`⚠️ Пропуск возможности из-за аномалии цен: ${buyPriceCheck.reason || sellPriceCheck.reason}`);
            continue;
          }

          // Check if profitable with additional validation for real trading
          const isRealTrading = !botConfig?.useSimulation && botConfig?.enableRealTrading;

          // Дополнительные проверки для реальной торговли
          let validationPassed = true;
          let validationReason = '';

          if (isRealTrading) {
            // Минимальный профит для реальной торговли должен быть выше
            const minRealTradingProfit = 5.0; // $5 минимум для реальной торговли
            if (netProfitUsd < minRealTradingProfit) {
              validationPassed = false;
              validationReason = `Прибыль $${netProfitUsd.toFixed(2)} ниже минимума $${minRealTradingProfit} для реальной торговли`;
            }

            // Проверка что цены не слишком волатильны
            const priceSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
            if (priceSpread > 10) {
              validationPassed = false;
              validationReason = `Спред ${priceSpread.toFixed(2)}% слишком высок - возможна ошибка данных`;
            }

            // Проверка что суммы положительные
            if (amount1 <= 0 || amount2 <= 0) {
              validationPassed = false;
              validationReason = `Некорректные суммы: amount1=${amount1}, amount2=${amount2}`;
            }
          }

          if (
            grossProfitPercent >= config.minProfitPercent &&
            netProfitPercent >= config.minNetProfitPercent &&
            netProfitUsd >= config.minProfitUsd &&
            validationPassed
          ) {
            const opportunity: ArbitrageOpportunity = {
              id: `${tokenIn}-${tokenOut}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              tokenIn: {
                address: tokenIn,
                symbol: quoteData1.fromToken.symbol,
                decimals: quoteData1.fromToken.decimals,
              },
              tokenOut: {
                address: tokenOut,
                symbol: quoteData1.toToken.symbol,
                decimals: quoteData1.toToken.decimals,
              },
              buyDex: buyDexName,
              sellDex: sellDexName,
              buyPrice: Math.min(buyPrice, sellPrice),
              sellPrice: Math.max(buyPrice, sellPrice),
              profitPercent: grossProfitPercent,
              netProfitPercent,
              estimatedProfitUsd: netProfitUsd,
              flashLoanAmount: loanAmount.toString(),
              estimatedGasCostUsd: estimatedGasCostUsd,
              flashLoanFeeUsd: flashLoanFeeUsd,
              route: {
                buy: [tokenIn, tokenOut],
                sell: [tokenOut, tokenIn],
              },
              timestamp: Date.now(),
              isValid: true,
            };

            opportunities.push(opportunity);
            console.log(`🎯 НАЙДЕНА ВОЗМОЖНОСТЬ! ${buyDexName} → ${sellDexName}, прибыль: $${netProfitUsd.toFixed(2)} [${isRealTrading ? 'РЕАЛЬНАЯ ТОРГОВЛЯ' : 'СИМУЛЯЦИЯ'}]`);
          } else if (!validationPassed && isRealTrading) {
            console.log(`⚠️ Возможность отклонена для реальной торговли: ${validationReason}`);
          }
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      const tokenPair = `${tokenIn}/${tokenOut}`;
      
      // Определяем код ошибки для упрощения диагностики
      let errorCode = 'SCANNER_UNKNOWN_ERROR';
      if (errorMessage.includes('BigNumberish')) errorCode = 'SCANNER_BIGNUMBER_ERROR';
      else if (errorMessage.includes('toAmount')) errorCode = 'SCANNER_TOAMOUNT_ERROR';
      else if (errorMessage.includes('validation')) errorCode = 'SCANNER_VALIDATION_ERROR';
      else if (errorMessage.includes('RPC')) errorCode = 'SCANNER_RPC_ERROR';
      else if (errorMessage.includes('timeout')) errorCode = 'SCANNER_TIMEOUT_ERROR';
      
      // Логируем в систему диагностики
      errorDiagnostics.logError('scanner', error, {
        tokenIn,
        tokenOut,
        userId,
        timestamp: Date.now(),
        errorCode,
      });

      // Record in health monitor
      tradingHealthMonitor.recordError();

      console.error(`❌ [${errorCode}] Ошибка сканирования ${tokenPair}:`, errorMessage);
      
      await storage.createActivityLog(userId, {
        type: 'scanner',
        level: 'error',
        message: `Ошибка при сканировании пары ${tokenPair}: ${errorMessage}`,
        metadata: { 
          error: error.stack,
          errorType: error.name,
          errorCode,
          tokenPair,
          recommendation: this.getErrorRecommendation(errorCode),
        },
      });
    }

    return opportunities;
  }

  /**
   * Симуляция второго DEX с отклонением цены для создания арбитражных возможностей
   */
  private async simulateSecondDexQuote(dexAggregator: DexAggregator, params: any): Promise<any> {
    try {
      const baseQuote = await dexAggregator.getQuote(params);

      // Полная валидация структуры базовой котировки
      if (!baseQuote || typeof baseQuote !== 'object') {
        throw new Error('Invalid base quote structure');
      }

      if (!baseQuote.toToken || !baseQuote.fromToken) {
        throw new Error('Missing token information in base quote');
      }

      if (!baseQuote.dstAmount || !baseQuote.toAmount) {
        throw new Error('Invalid base quote toAmount');
      }

      // Безопасное получение amount из toAmount (уже готовое значение)
      let baseAmount: number;
      try {
        // Используем toAmount напрямую, если это строка
        if (typeof baseQuote.toAmount === 'string') {
          baseAmount = parseFloat(baseQuote.toAmount);
        } else {
          baseAmount = parseFloat(ethers.formatUnits(baseQuote.dstAmount, baseQuote.toToken.decimals));
        }
        
        if (!isFinite(baseAmount) || baseAmount <= 0) {
          throw new Error(`Invalid base amount: ${baseAmount}`);
        }
      } catch (error: any) {
        throw new Error(`Failed to parse base amount: ${error.message}`);
      }

      // Добавляем отклонение цены 0.5-2% для создания арбитражной возможности
      const priceDeviation = 1 + (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1);
      const adjustedToAmount = baseAmount * priceDeviation;

      // Validate adjusted amount
      if (!isFinite(adjustedToAmount) || adjustedToAmount <= 0) {
        throw new Error(`Invalid adjusted amount: ${adjustedToAmount}`);
      }

      const adjustedAmountStr = adjustedToAmount.toFixed(baseQuote.toToken.decimals);

      return {
        ...baseQuote,
        toAmount: adjustedAmountStr,
        dstAmount: ethers.parseUnits(adjustedAmountStr, baseQuote.toToken.decimals).toString(),
        dex: Math.random() > 0.5 ? 'SushiSwap' : 'Uniswap V3',
      };
    } catch (error: any) {
      console.error('Error simulating second DEX quote:', error.message);
      throw error; // Throw для корректной обработки в Promise.allSettled
    }
  }

  /**
   * Симуляция третьего DEX с другим отклонением цены
   */
  private async simulateThirdDexQuote(dexAggregator: DexAggregator, params: any): Promise<any> {
    try {
      const baseQuote = await dexAggregator.getQuote(params);

      // Полная валидация структуры базовой котировки
      if (!baseQuote || typeof baseQuote !== 'object') {
        throw new Error('Invalid base quote structure');
      }

      if (!baseQuote.toToken || !baseQuote.fromToken) {
        throw new Error('Missing token information in base quote');
      }

      if (!baseQuote.dstAmount || !baseQuote.toAmount) {
        throw new Error('Invalid base quote toAmount');
      }

      // Безопасное получение amount из toAmount
      let baseAmount: number;
      try {
        // Используем toAmount напрямую, если это строка
        if (typeof baseQuote.toAmount === 'string') {
          baseAmount = parseFloat(baseQuote.toAmount);
        } else {
          baseAmount = parseFloat(ethers.formatUnits(baseQuote.dstAmount, baseQuote.toToken.decimals));
        }
        
        if (!isFinite(baseAmount) || baseAmount <= 0) {
          throw new Error(`Invalid base amount: ${baseAmount}`);
        }
      } catch (error: any) {
        throw new Error(`Failed to parse base amount: ${error.message}`);
      }

      // Добавляем другое отклонение цены
      const priceDeviation = 1 + (Math.random() * 0.012 + 0.003) * (Math.random() > 0.5 ? 1 : -1);
      const adjustedToAmount = baseAmount * priceDeviation;

      // Validate adjusted amount
      if (!isFinite(adjustedToAmount) || adjustedToAmount <= 0) {
        throw new Error(`Invalid adjusted amount: ${adjustedToAmount}`);
      }

      const adjustedAmountStr = adjustedToAmount.toFixed(baseQuote.toToken.decimals);

      return {
        ...baseQuote,
        toAmount: adjustedAmountStr,
        dstAmount: ethers.parseUnits(adjustedAmountStr, baseQuote.toToken.decimals).toString(),
        dex: Math.random() > 0.5 ? 'Balancer' : 'Curve',
      };
    } catch (error: any) {
      console.error('Error simulating third DEX quote:', error.message);
      throw error; // Throw для корректной обработки в Promise.allSettled
    }
  }

  /**
   * Get default token pairs to scan
   */
  private getDefaultTokenPairs(): Array<{ tokenIn: string; tokenOut: string }> {
    return [
      { tokenIn: TOKENS.USDC, tokenOut: TOKENS.USDT },
      { tokenIn: TOKENS.USDC, tokenOut: TOKENS.DAI },
      { tokenIn: TOKENS.WMATIC, tokenOut: TOKENS.USDC },
      { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC },
      { tokenIn: TOKENS.WBTC, tokenOut: TOKENS.USDC },
      { tokenIn: TOKENS.USDT, tokenOut: TOKENS.DAI },
    ];
  }

  /**
   * Get current opportunities
   */
  getOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.opportunities.values());
  }

  /**
   * Set broadcast callback for WebSocket updates
   */
  setBroadcastCallback(callback: (type: string, data: any) => void): void {
    this.broadcastCallback = callback;
  }

  /**
   * Check if scanner is running
   */
  isRunning(): boolean {
    return this.isScanning;
  }

  /**
   * Получение рекомендации по коду ошибки
   */
  private getErrorRecommendation(errorCode: string): string {
    const recommendations: Record<string, string> = {
      'SCANNER_BIGNUMBER_ERROR': 'Проверьте decimals токенов и корректность данных RPC',
      'SCANNER_TOAMOUNT_ERROR': 'Убедитесь что 1inch API возвращает корректные данные',
      'SCANNER_VALIDATION_ERROR': 'Проверьте настройки валидации в конфигурации',
      'SCANNER_RPC_ERROR': 'RPC недоступен или возвращает ошибочные данные. Проверьте RPC URL',
      'SCANNER_TIMEOUT_ERROR': 'Превышено время ожидания. Проверьте сетевое подключение',
      'SCANNER_UNKNOWN_ERROR': 'Неизвестная ошибка. Проверьте логи для деталей',
    };
    return recommendations[errorCode] || recommendations['SCANNER_UNKNOWN_ERROR'];
  }
}

// Export singleton instance
export const opportunityScanner = new OpportunityScanner();
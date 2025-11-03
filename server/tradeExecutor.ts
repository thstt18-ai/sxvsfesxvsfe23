import { ethers } from 'ethers';
import { storage } from './storage';
import { web3Provider } from './web3Provider';
import { aaveFlashLoanV3 } from './aaveFlashLoanV3';
import { DexAggregator } from './dexAggregator';
import { sendTelegramMessage } from './telegram';
import { riskManager } from './riskManager';
import { txGuard } from './txGuard';
import { tradeLogger } from './tradeLogger';
import { configLoader } from './configLoader';
import { approveManager } from './approveManager';
import { gasManager } from './gasManager';
import { priceImpactGuard } from './priceImpactGuard';
import type { ArbitrageOpportunity } from './opportunityScanner';
import { tenderlySimulator } from './tenderlySimulation'; // Added import

export interface TradeExecutionResult {
  success: boolean;
  txHash?: string;
  profitUsd?: number;
  gasCostUsd?: number;
  message: string;
  error?: string;
  executionTime?: number;
}

export class TradeExecutor {
  /**
   * Get provider for chain
   */
  private getProvider(chainId: number): ethers.JsonRpcProvider {
    return web3Provider.getProvider(chainId);
  }

  /**
   * Execute arbitrage trade using flash loan
   * This is the CRITICAL function that actually executes trades!
   */
  async executeArbitrageTrade(
    userId: string,
    opportunity: ArbitrageOpportunity,
    isSimulation: boolean = true
  ): Promise<TradeExecutionResult> {
    const startTime = Date.now();

    try {
      console.log(`\n🚀 EXECUTING ARBITRAGE TRADE`);
      console.log(`   Mode: ${isSimulation ? 'SIMULATION' : 'REAL TRADING'}`);
      console.log(`   Pair: ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`);
      console.log(`   Buy: ${opportunity.buyDex} → Sell: ${opportunity.sellDex}`);
      console.log(`   Expected Profit: $${opportunity.estimatedProfitUsd.toFixed(2)}`);

      // Step 1: Validate opportunity is still profitable
      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🔍 ШАГ 1/7: Проверка арбитражной возможности ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
        metadata: {
          opportunityId: opportunity.id,
          expectedProfit: opportunity.estimatedProfitUsd,
          mode: isSimulation ? 'simulation' : 'real',
          step: '1_validation',
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
        },
      });

      // Step 2: Get bot configuration
      const config = await storage.getBotConfig(userId);
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      // Step 3: Check LIVE-флаг и real trading
      const riskConfig = configLoader.getConfig();

      if (!isSimulation) {
        // Проверяем глобальный LIVE-флаг
        if (!riskConfig.enableLiveTrading) {
          await storage.createActivityLog(userId, {
            type: 'trade_execution',
            level: 'error',
            message: `❌ КРИТИЧЕСКАЯ ОШИБКА: Реальная торговля отключена глобально (ENABLE_LIVE_TRADING != true)`,
            metadata: {
              step: '3_live_flag_check_failed',
              error: 'live_trading_disabled',
              recommendation: 'Установите ENABLE_LIVE_TRADING=true в Secrets для включения реальной торговли',
            },
          });
          throw new Error('Реальная торговля отключена глобально. Установите ENABLE_LIVE_TRADING=true в переменных окружения.');
        }

        // Проверяем настройку в конфигурации
        if (!config.enableRealTrading) {
          throw new Error('Real trading is disabled in configuration');
        }
      }

      // Step 4: Get chain ID from config
      const chainId = config.networkMode === 'mainnet' ? 137 : 80002;

      // Step 5: Validate private key for real trading
      // Check config first, then environment variable as fallback
      let privateKey = config.privateKey?.trim() || process.env.PRIVATE_KEY;

      // Validate private key format (must start with 0x and be 66 chars total)
      if (privateKey && !privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      if (privateKey && privateKey.length !== 66) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ ОШИБКА: Неверный формат приватного ключа. Должен быть 64 символа (без 0x) или 66 (с 0x)`,
          metadata: {
            step: '2_validation_failed',
            error: 'invalid_private_key_format',
            keyLength: privateKey.length,
            recommendation: 'Проверьте формат приватного ключа в Settings',
          },
        });
        throw new Error('Invalid private key format. Must be 64 hex characters (or 66 with 0x prefix)');
      }

      if (!isSimulation && !privateKey) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ ОШИБКА: Приватный ключ не настроен для реальной торговли. Установите PRIVATE_KEY в переменных окружения или в Settings → Safe & Ledger`,
          metadata: {
            step: '2_validation_failed',
            error: 'private_key_not_configured',
            recommendation: 'Добавьте PRIVATE_KEY в Secrets или в настройках приложения',
          },
        });
        throw new Error('Private key not configured for real trading. Set PRIVATE_KEY in environment or Settings.');
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🔐 ШАГ 2/7: Приватный ключ подтвержден ${privateKey ? '(настроен)' : '(отсутствует)'}`,
        metadata: {
          step: '2_key_validation',
          keySource: config.privateKey ? 'config' : 'environment',
          isConfigured: !!privateKey,
        },
      });

      // Step 5: Check MATIC balance (for gas fees)
      let maticBalance = '0';
      if (!isSimulation && privateKey) {
        try {
          const wallet = new ethers.Wallet(privateKey);
          const walletAddress = wallet.address;

          const balanceData = await web3Provider.getNativeBalance(walletAddress, chainId);
          maticBalance = balanceData.balanceFormatted;

          const minMaticRequired = 0.1; // Minimum 0.1 MATIC for gas
          const currentMatic = parseFloat(maticBalance);

          await storage.createActivityLog(userId, {
            type: 'trade_execution',
            level: 'info',
            message: `💰 ШАГ 3/7: Проверка баланса MATIC: ${currentMatic.toFixed(4)} MATIC ${currentMatic < minMaticRequired ? '⚠️ НИЗКИЙ!' : '✅'}`,
            metadata: {
              step: '3_balance_check',
              maticBalance: currentMatic,
              minRequired: minMaticRequired,
              walletAddress,
              isSufficient: currentMatic >= minMaticRequired,
            },
          });

          if (currentMatic < minMaticRequired) {
            throw new Error(`Insufficient MATIC balance: ${currentMatic.toFixed(4)} MATIC (minimum: ${minMaticRequired} MATIC required for gas)`);
          }
        } catch (error: any) {
          console.error('Failed to check MATIC balance:', error);
          await storage.createActivityLog(userId, {
            type: 'trade_execution',
            level: 'warning',
            message: `⚠️ Не удалось проверить баланс MATIC: ${error.message}`,
            metadata: {
              step: '3_balance_check_failed',
              error: error.message,
            },
          });
        }
      }

      // Step 6: Check current gas price with GasManager
      const provider = this.getProvider(chainId);

      // В режиме симуляции полностью пропускаем валидацию токенов
      if (isSimulation) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `⏭️ ШАГ 4.1/7: Валидация токенов пропущена (режим симуляции)`,
          metadata: {
            step: '4.1_token_validation_skipped',
            mode: 'simulation',
            tokenIn: opportunity.tokenIn.symbol,
            tokenOut: opportunity.tokenOut.symbol,
          },
        });
      } else {
        // В реальной торговле проверяем токены, но не блокируем сделку
        const { tokenValidator } = await import('./tokenValidator');

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `🔍 ШАГ 4.1/7: Валидация токенов ${opportunity.tokenIn.symbol} и ${opportunity.tokenOut.symbol}`,
          metadata: {
            step: '4.1_token_validation',
            tokenInAddress: opportunity.tokenIn.address,
            tokenOutAddress: opportunity.tokenOut.address,
          },
        });

        // Валидация tokenIn (не блокирующая)
        try {
          const tokenInValidation = await tokenValidator.validateToken(userId, opportunity.tokenIn.address, provider);
          if (!tokenInValidation.valid) {
            await storage.createActivityLog(userId, {
              type: 'trade_execution',
              level: 'warning',
              message: `⚠️ Предупреждение: Токен ${opportunity.tokenIn.symbol} не прошел валидацию: ${tokenInValidation.reason}`,
              metadata: {
                step: '4.1_token_validation_warning',
                tokenAddress: opportunity.tokenIn.address,
                reason: tokenInValidation.reason,
                checks: tokenInValidation.checks,
                note: 'Продолжаем выполнение сделки',
              },
            });
          }
        } catch (error: any) {
          console.warn(`Token validation error for ${opportunity.tokenIn.symbol}:`, error.message);
        }

        // Валидация tokenOut (не блокирующая)
        try {
          const tokenOutValidation = await tokenValidator.validateToken(userId, opportunity.tokenOut.address, provider);
          if (!tokenOutValidation.valid) {
            await storage.createActivityLog(userId, {
              type: 'trade_execution',
              level: 'warning',
              message: `⚠️ Предупреждение: Токен ${opportunity.tokenOut.symbol} не прошел валидацию: ${tokenOutValidation.reason}`,
              metadata: {
                step: '4.1_token_validation_warning',
                tokenAddress: opportunity.tokenOut.address,
                reason: tokenOutValidation.reason,
                checks: tokenOutValidation.checks,
                note: 'Продолжаем выполнение сделки',
              },
            });
          }
        } catch (error: any) {
          console.warn(`Token validation error for ${opportunity.tokenOut.symbol}:`, error.message);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ Валидация токенов завершена (продолжаем независимо от результата)`,
          metadata: {
            step: '4.1_token_validation_completed',
          },
        });
      }

      const isGasAcceptable = await gasManager.isGasPriceAcceptable(provider);

      const gasData = await web3Provider.getGasPrice();
      const currentGasGwei = parseFloat(gasData.gasPriceGwei);

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `⛽ ШАГ 4/7: Проверка цены газа: ${currentGasGwei.toFixed(1)} Gwei ${!isGasAcceptable ? '⚠️ ВЫСОКАЯ!' : '✅'}`,
        metadata: {
          step: '4_gas_check',
          gasGwei: currentGasGwei,
          maxGasGwei: config.maxGasPriceGwei,
          maticBalance,
          isAcceptable: isGasAcceptable,
        },
      });

      if (!isGasAcceptable) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ ОШИБКА: Цена газа слишком высокая ${currentGasGwei.toFixed(1)} Gwei (максимум: ${config.maxGasPriceGwei} Gwei). Ожидание снижения...`,
          metadata: {
            step: '4_gas_too_high',
            gasGwei: currentGasGwei,
            maxGasGwei: config.maxGasPriceGwei,
            recommendation: 'Дождитесь снижения цены газа или увеличьте лимит в Settings',
          },
        });
        throw new Error(`Gas price too high: ${currentGasGwei} Gwei (max: ${config.maxGasPriceGwei})`);
      }

      // Step 6.5: Ensure token approvals before swaps
      let buyRouterAddress: string | undefined;
      let sellRouterAddress: string | undefined;

      if (!isSimulation && privateKey) {
        const wallet = new ethers.Wallet(privateKey, provider);

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `🔐 ШАГ 4.5/7: Проверка approve для токенов`,
          metadata: {
            step: '4.5_approve_check',
            tokenIn: opportunity.tokenIn.symbol,
          },
        });

        // Approve token for router if needed
        const loanAmount = ethers.parseUnits(
          opportunity.flashLoanAmount,
          opportunity.tokenIn.decimals
        );

        // Map DEX names to router addresses
        const DEX_ROUTERS: { [key: string]: string } = {
          '1inch': '0x1111111254EEB25477B68fb85Ed929f73A960582',
          'QuickSwap': '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
          'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
          'SushiSwap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        };

        buyRouterAddress = DEX_ROUTERS[opportunity.buyDex];

        if (!buyRouterAddress) {
          throw new Error(`Unknown DEX: ${opportunity.buyDex}. Cannot determine router address.`);
        }

        const approveResult = await approveManager.ensureApproved(
          userId,
          opportunity.tokenIn.address,
          wallet.address,
          buyRouterAddress,
          loanAmount,
          wallet,
          chainId
        );

        if (!approveResult.approved) {
          throw new Error(`Approve failed: ${approveResult.error}`);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ Token approvals готовы ${approveResult.txHash ? `(TX: ${approveResult.txHash.substring(0, 10)}...)` : '(cached)'}`,
          metadata: {
            step: '4.5_approve_ready',
            cached: !approveResult.txHash,
          },
        });
      }

      // Step 6: SIMULATION MODE - Just log and create mock transaction
      if (isSimulation) {
        console.log('📊 SIMULATION MODE - Creating mock transaction');

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `⚡ ШАГ 5/7: СИМУЛЯЦИЯ - Подготовка мок-транзакции`,
          metadata: {
            mode: 'simulation',
            step: '5_mock_transaction',
          },
        });

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ ШАГ 7/7: СИМУЛЯЦИЯ ЗАВЕРШЕНА! Прибыль: $${opportunity.estimatedProfitUsd.toFixed(2)}`,
          metadata: {
            mode: 'simulation',
            pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
            profit: opportunity.estimatedProfitUsd,
            dexs: `${opportunity.buyDex} → ${opportunity.sellDex}`,
            step: '7_completed',
          },
        });

        // Create simulated transaction record with unique hash
        const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).substring(2).padStart(40, '0')}`.substring(0, 66);

        await storage.createArbitrageTransaction(userId, {
          txHash: mockTxHash,
          tokenIn: opportunity.tokenIn.symbol,
          tokenOut: opportunity.tokenOut.symbol,
          amountIn: opportunity.flashLoanAmount,
          amountOut: (parseFloat(opportunity.flashLoanAmount) * 1.01).toString(),
          profitUsd: opportunity.estimatedProfitUsd.toString(),
          gasCostUsd: opportunity.estimatedGasCostUsd.toString(),
          netProfitUsd: (opportunity.estimatedProfitUsd - opportunity.estimatedGasCostUsd).toString(),
          status: 'success',
          dexPath: `${opportunity.buyDex} → ${opportunity.sellDex}`,
        });

        // Send Telegram notification for significant profits
        const profitThreshold = parseFloat(config.telegramProfitThresholdUsd?.toString() || '10');
        if (opportunity.estimatedProfitUsd >= profitThreshold) {
          await sendTelegramMessage(
            userId,
            `🎯 <b>СИМУЛЯЦИЯ: Арбитражная сделка</b>\n\n` +
            `💹 Пара: ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}\n` +
            `📊 DEX: ${opportunity.buyDex} → ${opportunity.sellDex}\n` +
            `💰 Прибыль: $${opportunity.estimatedProfitUsd.toFixed(2)} (${opportunity.netProfitPercent.toFixed(2)}%)\n` +
            `⛽ Gas: $${opportunity.estimatedGasCostUsd.toFixed(2)}\n` +
            `⏱ Время: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n` +
            `🔗 TX: ${mockTxHash.substring(0, 10)}...`,
            'trade_success'
          );
        }

        return {
          success: true,
          txHash: mockTxHash,
          profitUsd: opportunity.estimatedProfitUsd,
          gasCostUsd: opportunity.estimatedGasCostUsd,
          message: `Simulation successful - profit $${opportunity.estimatedProfitUsd.toFixed(2)}`,
          executionTime: Date.now() - startTime,
        };
      }

      // Step 7: REAL TRADING MODE
      console.log('💸 REAL TRADING MODE - Executing actual transaction');

      // Validate 1inch API key is configured for real trading
      if (!config.oneinchApiKey?.trim()) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ ОШИБКА: 1inch API ключ не настроен для реальной торговли. Добавьте API ключ в Settings → Trading Parameters`,
          metadata: {
            step: '5_api_key_missing',
            error: '1inch_api_key_not_configured',
            recommendation: 'Получите бесплатный API ключ на https://portal.1inch.dev/ и добавьте в настройках',
          },
        });
        throw new Error('1inch API key not configured for real trading. Add it in Settings → Trading Parameters');
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'warning',
        message: `⚠️ ШАГ 5/7: РЕАЛЬНАЯ ТОРГОВЛЯ - Начало исполнения с реальными средствами`,
        metadata: {
          mode: 'real',
          step: '5_real_execution',
          pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
          expectedProfit: opportunity.estimatedProfitUsd,
          has1inchKey: !!config.oneinchApiKey,
        },
      });

      // Step 8: Prepare flash loan parameters
      const loanAmount = ethers.parseUnits(
        opportunity.flashLoanAmount,
        opportunity.tokenIn.decimals
      );

      // Get DexAggregator for executing swaps
      const dexAggregator = new DexAggregator(config.oneinchApiKey || undefined);

      // SECURITY: Derive wallet address from private key (NEVER send private key to APIs!)
      if (!privateKey) {
        throw new Error('Private key is required but not configured');
      }

      const wallet = new ethers.Wallet(privateKey);
      const walletAddress = wallet.address;

      // Проверяем RPC URL перед продолжением
      const rpcUrl = config.networkMode === 'mainnet'
        ? config.polygonRpcUrl
        : config.polygonTestnetRpcUrl;

      if (!rpcUrl) {
        throw new Error(`RPC URL не настроен для ${config.networkMode === 'mainnet' ? 'mainnet' : 'testnet'}`);
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🔧 Инициализация DEXAggregator ${config.oneinchApiKey ? 'с 1inch API ключом' : 'в DEMO режиме'}`,
        metadata: {
          step: '5.1_dex_init',
          mode: config.oneinchApiKey ? 'production' : 'demo',
          walletAddress,
          rpcUrl: rpcUrl.substring(0, 30) + '...',
        },
      });

      // Step 10: Проверка рисков через RiskManager
      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🛡️ ШАГ 6/10: Проверка лимитов риска и баланса MATIC`,
        metadata: {
          step: '6_risk_check',
          tradeAmountUsd: opportunity.estimatedProfitUsd,
        },
      });

      const riskCheck = await riskManager.checkTradeRisk(
        userId,
        parseFloat(opportunity.flashLoanAmount),
        opportunity.estimatedGasCostUsd,
        walletAddress,
        chainId
      );

      if (!riskCheck.allowed) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ РИСК-МЕНЕДЖЕР ОТКЛОНИЛ СДЕЛКУ: ${riskCheck.reason}`,
          metadata: {
            step: '6_risk_check_failed',
            reason: riskCheck.reason,
            details: riskCheck.details,
          },
        });
        throw new Error(`Сделка отклонена риск-менеджером: ${riskCheck.reason}`);
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'success',
        message: `✅ Проверка рисков пройдена, Flash Loan будет использован для ${opportunity.tokenIn.symbol}`,
        metadata: {
          step: '6_risk_check_passed',
          token: opportunity.tokenIn.symbol,
          loanAmount: opportunity.flashLoanAmount,
        },
      });

      // Step 11: Build swap transactions with enhanced error handling
      let buySwap;
      let sellSwap;

      try {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `🔄 Построение BUY транзакции: ${opportunity.tokenIn.symbol} → ${opportunity.tokenOut.symbol}`,
          metadata: {
            step: '5.2_build_buy_swap',
            tokenIn: opportunity.tokenIn.symbol,
            tokenOut: opportunity.tokenOut.symbol,
            amount: loanAmount.toString(),
          },
        });

        // Проверка на null/undefined значения
        if (!loanAmount || loanAmount.toString() === '0') {
          throw new Error(`Некорректная сумма займа: ${loanAmount}. Должна быть положительным BigNumberish значением.`);
        }

        if (!opportunity.tokenIn.address || !opportunity.tokenOut.address) {
          throw new Error(`Некорректные адреса токенов: tokenIn=${opportunity.tokenIn.address}, tokenOut=${opportunity.tokenOut.address}`);
        }

        if (!walletAddress || !ethers.isAddress(walletAddress)) {
          throw new Error(`Некорректный адрес кошелька: ${walletAddress}`);
        }

        // Проверка slippage через TxGuard
        const maxSlippage = riskConfig.maxSlippagePercent;

        buySwap = await dexAggregator.buildSwapTransaction({
          src: opportunity.tokenIn.address,
          dst: opportunity.tokenOut.address,
          amount: loanAmount.toString(),
          from: walletAddress, // Wallet address (NOT private key!)
          slippage: maxSlippage, // Контролируемый slippage из конфига
          disableEstimate: false, // Enable gas estimation
          allowPartialFill: false
        });

        // Проверка результата buySwap
        if (!buySwap || !buySwap.toAmount) {
          throw new Error(`BUY swap не вернул корректные данные. Получено: ${JSON.stringify(buySwap)}`);
        }

        // Валидация транзакции через TxGuard
        const txValidation = txGuard.validateTransaction({
          fromAmount: loanAmount.toString(),
          expectedToAmount: buySwap.toAmount,
          minToAmount: txGuard.calculateMinAmount(buySwap.toAmount, maxSlippage),
          deadline: txGuard.getDeadline(),
        });

        if (!txValidation.safe) {
          throw new Error(`TxGuard отклонил BUY транзакцию: ${txValidation.reason}`);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ BUY транзакция построена: получим ${buySwap.toAmount} ${opportunity.tokenOut.symbol} через ${buySwap.dex}`,
          metadata: {
            step: '5.3_buy_swap_ready',
            toAmount: buySwap.toAmount,
            dex: buySwap.dex,
            estimatedGas: buySwap.estimatedGas,
          },
        });

      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ Ошибка построения BUY транзакции: ${error.message}`,
          metadata: {
            step: '5.3_buy_swap_failed',
            error: error.message,
            stack: error.stack,
          },
        });
        throw new Error(`Failed to build buy swap transaction: ${error.message}`);
      }

      try {
        // Convert toAmount to integer string (1inch requires integer string format)
        if (!buySwap.toAmount || isNaN(parseFloat(buySwap.toAmount))) {
          throw new Error(`BUY swap вернул некорректное значение toAmount: ${buySwap.toAmount}`);
        }

        const sellAmount = Math.floor(parseFloat(buySwap.toAmount)).toString();

        if (!sellAmount || sellAmount === '0' || sellAmount === 'NaN') {
          throw new Error(`Некорректная сумма для SELL swap: ${sellAmount}. Исходное значение buySwap.toAmount: ${buySwap.toAmount}`);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'info',
          message: `🔄 Построение SELL транзакции: ${opportunity.tokenOut.symbol} → ${opportunity.tokenIn.symbol}`,
          metadata: {
            step: '5.4_build_sell_swap',
            tokenIn: opportunity.tokenOut.symbol,
            tokenOut: opportunity.tokenIn.symbol,
            amount: sellAmount,
          },
        });

        sellSwap = await dexAggregator.buildSwapTransaction({
          src: opportunity.tokenOut.address,
          dst: opportunity.tokenIn.address,
          amount: sellAmount,
          from: walletAddress, // Wallet address (NOT private key!)
          slippage: 1, // 1% slippage tolerance
          disableEstimate: false, // Enable gas estimation
          allowPartialFill: false
        });

        // Проверка результата sellSwap
        if (!sellSwap || !sellSwap.toAmount) {
          throw new Error(`SELL swap не вернул корректные данные. Получено: ${JSON.stringify(sellSwap)}`);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ SELL транзакция построена: получим ${sellSwap.toAmount} ${opportunity.tokenIn.symbol} через ${sellSwap.dex}`,
          metadata: {
            step: '5.5_sell_swap_ready',
            toAmount: sellSwap.toAmount,
            dex: sellSwap.dex,
            estimatedGas: sellSwap.estimatedGas,
          },
        });

      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ Ошибка построения SELL транзакции: ${error.message}`,
          metadata: {
            step: '5.5_sell_swap_failed',
            error: error.message,
            stack: error.stack,
          },
        });
        throw new Error(`Failed to build sell swap transaction: ${error.message}`);
      }

      console.log('✅ Swap transactions built successfully');
      console.log(`   BUY: ${buySwap.fromAmount} ${opportunity.tokenIn.symbol} → ${buySwap.toAmount} ${opportunity.tokenOut.symbol} (${buySwap.dex})`);
      console.log(`   SELL: ${sellSwap.fromAmount} ${opportunity.tokenOut.symbol} → ${sellSwap.toAmount} ${opportunity.tokenIn.symbol} (${sellSwap.dex})`);

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🔄 ШАГ 6/8: Транзакции свопов подготовлены - выполнение Flash Loan через Aave V3`,
        metadata: {
          step: '6_swap_preparation',
          buyAmount: buySwap.toAmount,
          sellAmount: sellSwap.toAmount,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
        },
      });

      // Step 11: Execute flash loan with arbitrage using deployed smart contract

      // Import contract setup validator
      const { ensureContractDeployed } = await import('./contractAutoSetup');

      // Check if contract is deployed
      const contractCheck = await ensureContractDeployed(userId, chainId);

      if (!contractCheck.success) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ КРИТИЧЕСКАЯ ОШИБКА: ${contractCheck.error}`,
          metadata: {
            step: '6.1_contract_check_failed',
            error: contractCheck.error,
            needsDeployment: contractCheck.needsDeployment,
          },
        });
        throw new Error(contractCheck.error || 'Contract deployment check failed');
      }

      let arbitrageContractAddress = contractCheck.contractAddress!;

      if (!arbitrageContractAddress || arbitrageContractAddress === '0x0000000000000000000000000000000000000000') {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ ОШИБКА: ArbitrageExecutor контракт не развернут. Для реальной торговли необходимо развернуть контракт.`,
          metadata: {
            step: '6.1_contract_missing',
            error: 'contract_not_deployed',
            networkMode: config.networkMode,
            chainId,
            recommendation: 'Разверните контракт командой: npx hardhat run scripts/deploy.ts --network ' + (chainId === 137 ? 'polygon' : 'amoy'),
          },
        });

        throw new Error(
          `ArbitrageExecutor контракт не развернут для ${config.networkMode === 'mainnet' ? 'mainnet' : 'testnet'}. ` +
          `Выполните: cd contracts && npx hardhat run scripts/deploy.ts --network ${chainId === 137 ? 'polygon' : 'amoy'}`
        );
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `📄 Используется смарт-контракт: ${arbitrageContractAddress.substring(0, 10)}...`,
        metadata: {
          step: '6.1_contract_address',
          contractAddress: arbitrageContractAddress,
          network: config.networkMode,
          chainId,
        },
      });

      // Map DEX names to router addresses on Polygon
      const DEX_ROUTERS: { [key: string]: string } = {
        '1inch': '0x1111111254EEB25477B68fb85Ed929f73A960582', // 1inch V5 Router on Polygon
        'QuickSwap': '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // QuickSwap Router
        'Uniswap V3': '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 SwapRouter
        'SushiSwap': '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap Router
        'Curve': '0x445FE580eF8d70FF569aB36e80c647af338db351', // Curve Aave Pool (example)
        'Balancer': '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // Balancer Vault
      };

      // Get router addresses - use actual addresses from transaction data if available, otherwise fallback to known routers
      buyRouterAddress = buySwap.tx?.to || DEX_ROUTERS[opportunity.buyDex] || arbitrageContractAddress;
      sellRouterAddress = sellSwap.tx?.to || DEX_ROUTERS[opportunity.sellDex] || arbitrageContractAddress;

      // Validate router addresses
      if (!ethers.isAddress(buyRouterAddress)) {
        throw new Error(`Invalid buy router address for ${opportunity.buyDex}: ${buyRouterAddress}`);
      }
      if (!ethers.isAddress(sellRouterAddress)) {
        throw new Error(`Invalid sell router address for ${opportunity.sellDex}: ${sellRouterAddress}`);
      }

      // Validate transaction data is present
      if (!buySwap.tx?.data) {
        throw new Error('Buy swap transaction data is missing');
      }
      if (!sellSwap.tx?.data) {
        throw new Error('Sell swap transaction data is missing');
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `📄 Используются роутеры: BUY=${buyRouterAddress.substring(0, 10)}... SELL=${sellRouterAddress.substring(0, 10)}...`,
        metadata: {
          step: '6.2_router_addresses',
          buyRouter: buyRouterAddress,
          sellRouter: sellRouterAddress,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
        },
      });

      // Validate contract address exists
      if (!arbitrageContractAddress || arbitrageContractAddress === '0x0000000000000000000000000000000000000000') {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ КРИТИЧЕСКАЯ ОШИБКА: Адрес контракта не настроен`,
          metadata: {
            step: '6.3_no_contract_address',
            chainId,
            network: config.networkMode,
            recommendation: 'Разверните контракт или укажите адрес в Settings',
          },
        });
        throw new Error('Адрес контракта не настроен. Разверните контракт или укажите адрес в Settings.');
      }

      // Validate contract is deployed and has code
      const contractCode = await provider.getCode(arbitrageContractAddress);
      if (contractCode === '0x' || contractCode === '0x0') {
        const networkName = chainId === 137 ? 'polygon' : 'amoy';

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ КРИТИЧЕСКАЯ ОШИБКА: Контракт не найден по адресу ${arbitrageContractAddress}`,
          metadata: {
            step: '6.3_contract_not_found',
            contractAddress: arbitrageContractAddress,
            chainId,
            network: networkName,
            recommendation: `Разверните контракт: cd contracts && npx hardhat run scripts/deploy.ts --network ${networkName}`,
          },
        });

        throw new Error(
          `ArbitrageExecutor контракт не найден по адресу ${arbitrageContractAddress}. ` +
          `Разверните контракт: cd contracts && npx hardhat run scripts/deploy.ts --network ${networkName}`
        );
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `✅ Смарт-контракт проверен и готов к использованию`,
        metadata: {
          step: '6.3_contract_validated',
          contractAddress: arbitrageContractAddress,
          codeSize: contractCode.length,
        },
      });

      // Check if executor is authorized
      const { checkExecutorStatus } = await import('./contractAuthorization');
      const authStatus = await checkExecutorStatus(arbitrageContractAddress, walletAddress, chainId);

      if (!authStatus.isAuthorized && !authStatus.isOwner) {
        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'error',
          message: `❌ КРИТИЧЕСКАЯ ОШИБКА: Кошелек ${walletAddress} НЕ авторизован для исполнения`,
          metadata: {
            step: '6.4_not_authorized',
            walletAddress,
            contractAddress: arbitrageContractAddress,
            ownerAddress: authStatus.ownerAddress,
            recommendation: `Авторизуйте кошелек: cd contracts && npx tsx scripts/authorize-executor.ts ${arbitrageContractAddress} ${walletAddress}`,
          },
        });

        throw new Error(
          `Кошелек ${walletAddress} не авторизован для исполнения сделок. ` +
          `Owner контракта: ${authStatus.ownerAddress}. ` +
          `Авторизуйте кошелек: cd contracts && npx tsx scripts/authorize-executor.ts ${arbitrageContractAddress} ${walletAddress}`
        );
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'success',
        message: `✅ Кошелек авторизован (${authStatus.isOwner ? 'owner' : 'executor'})`,
        metadata: {
          step: '6.4_authorized',
          walletAddress,
          isOwner: authStatus.isOwner,
          isAuthorized: authStatus.isAuthorized,
        },
      });

      // Calculate minimum profit (0.1% of loan amount to cover flash loan fee)
      const minProfitAmount = (loanAmount * BigInt(10)) / BigInt(10000); // 0.1%

      // Encode arbitrage parameters for smart contract
      const arbParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(tuple(address,bytes),tuple(address,bytes),uint256)'],
        [[
          [buyRouterAddress, buySwap.tx.data],
          [sellRouterAddress, sellSwap.tx.data],
          minProfitAmount.toString()
        ]]
      );

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `📊 Параметры арбитража: minProfit=${ethers.formatUnits(minProfitAmount, opportunity.tokenIn.decimals)} ${opportunity.tokenIn.symbol}`,
        metadata: {
          step: '6.4_arbitrage_params',
          minProfit: minProfitAmount.toString(),
          buyRouter: buyRouterAddress,
          sellRouter: sellRouterAddress,
        },
      });

      // --- Tenderly Simulation ---
      if (process.env.ENABLE_TENDERLY === "true") {
        console.log('🔬 Simulating transaction with Tenderly...');

        const simulationRequest = {
          from: walletAddress,
          to: arbitrageContractAddress,
          data: arbParams, // Use encoded arbitrage parameters
          value: '0',
          gasLimit: 500000, // Adjust as needed
        };

        const validation = await tenderlySimulator.validateBeforeExecution(
          simulationRequest,
          BigInt(Math.floor(opportunity.estimatedProfitUsd * 1e6)), // Convert to USDC units for profit check
          riskConfig.maxSlippagePercent // Use configured max slippage
        );

        if (!validation.allowed) {
          console.log('❌ Simulation failed, aborting execution');
          console.log(`   Reason: ${validation.reason}`);

          await storage.createActivityLog(userId, {
            type: 'trade_execution',
            level: 'error',
            message: `❌ Tenderly simulation failed: ${validation.reason}`,
            metadata: {
              step: '6.5_tenderly_failed',
              reason: validation.reason,
              simulationResult: validation,
            },
          });

          throw new Error(`Tenderly simulation failed: ${validation.reason}`);
        }

        await storage.createActivityLog(userId, {
          type: 'trade_execution',
          level: 'success',
          message: `✅ Tenderly simulation passed. Estimated profit: $${validation.estimatedProfitUsd.toFixed(2)}`,
          metadata: {
            step: '6.5_tenderly_passed',
            simulationResult: validation,
          },
        });
        console.log('✅ Simulation passed, proceeding with execution');
      }
      // --- End Tenderly Simulation ---


      // Step 11: Execute flash loan through deployed contract
      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'info',
        message: `🔄 ШАГ 7/8: Вызов Flash Loan через смарт-контракт...`,
        metadata: {
          step: '7_execute_flashloan',
          contractAddress: arbitrageContractAddress,
          loanAmount: loanAmount.toString(),
        },
      });

      const result = await aaveFlashLoanV3.executeFlashLoan(
        userId,
        {
          assets: [opportunity.tokenIn.address],
          amounts: [loanAmount.toString()],
          receiverAddress: arbitrageContractAddress,
          params: arbParams,
        },
        privateKey!
      );

      if (!result.success) {
        throw new Error(result.error || 'Flash loan execution failed');
      }

      const realTxHash = result.txHash || `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`;

      const netProfitUsd = opportunity.estimatedProfitUsd - opportunity.estimatedGasCostUsd;

      await storage.createArbitrageTransaction(userId, {
        txHash: realTxHash,
        tokenIn: opportunity.tokenIn.symbol,
        tokenOut: opportunity.tokenOut.symbol,
        amountIn: opportunity.flashLoanAmount,
        amountOut: buySwap.toAmount,
        profitUsd: opportunity.estimatedProfitUsd.toString(),
        gasCostUsd: opportunity.estimatedGasCostUsd.toString(),
        netProfitUsd: netProfitUsd.toString(),
        status: 'pending',
        dexPath: `${opportunity.buyDex} → ${opportunity.sellDex}`,
      });

      // Логирование сделки в CSV
      tradeLogger.logTrade({
        timestamp: new Date().toISOString(),
        tradeId: opportunity.id,
        tokenIn: opportunity.tokenIn.symbol,
        tokenOut: opportunity.tokenOut.symbol,
        amountIn: opportunity.flashLoanAmount,
        amountOut: buySwap.toAmount,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        profitUsd: opportunity.estimatedProfitUsd,
        gasCostUsd: opportunity.estimatedGasCostUsd,
        netProfitUsd,
        netProfitPercent: opportunity.netProfitPercent,
        txHash: realTxHash,
        status: 'success',
      });

      // Обновление дневной статистики
      await riskManager.updateDailyStats(
        userId,
        opportunity.estimatedProfitUsd,
        opportunity.estimatedGasCostUsd,
        true
      );

      // === НОВАЯ ЛОГИКА: Автоперевод депозита на указанный кошелек ===
      // После успешного вызова контракта весь депозит попадает на depositWalletAddress
      console.log('💰 Checking for auto-deposit transfer...');
      const { depositManager } = await import('./depositManager');
      
      try {
        const transferSuccess = await depositManager.transferDeposit({
          userId,
          tokenAddress: opportunity.tokenIn, // USDC или другой токен
          amount: opportunity.estimatedProfitUsd.toFixed(6), // Прибыль для перевода
          profitUsd: opportunity.estimatedProfitUsd,
          txHash: receipt.hash
        });

        if (transferSuccess) {
          console.log('✅ Deposit auto-transferred to configured wallet');
        } else {
          console.log('⚠️  Deposit auto-transfer failed or skipped');
        }
      } catch (transferError) {
        console.error('❌ Error during deposit transfer:', transferError);
        // Не прерываем основной процесс, просто логируем ошибку
      }

      // Проверка circuit breaker
      const shouldBreak = await riskManager.checkCircuitBreaker(userId);
      if (shouldBreak) {
        await storage.updateBotStatus(userId, {
          isPaused: true,
          pauseReason: 'Circuit breaker activated due to risk limits',
        });
      }

      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'success',
        message: `✅ ШАГ 8/8: ТРАНЗАКЦИЯ ОТПРАВЛЕНА! TX: ${realTxHash.substring(0, 10)}...`,
        metadata: {
          step: '8_transaction_sent',
          txHash: realTxHash,
          profit: opportunity.estimatedProfitUsd,
          status: 'pending_confirmation',
        },
      });

      // Post-trade balance reconciliation
      try {
        const wallet = new ethers.Wallet(privateKey!, provider);
        const tokenContract = new ethers.Contract(
          opportunity.tokenIn.address,
          ['function balanceOf(address) view returns (uint256)'],
          provider
        );

        const actualBalance = await tokenContract.balanceOf(wallet.address);
        const expectedAmount = ethers.parseUnits(opportunity.flashLoanAmount, opportunity.tokenIn.decimals);
        const tolerance = expectedAmount * BigInt(5) / BigInt(1000); // 0.5% tolerance
        const delta = actualBalance > expectedAmount ? actualBalance - expectedAmount : expectedAmount - actualBalance;

        if (delta > tolerance) {
          const deltaPercent = (Number(delta) / Number(expectedAmount)) * 100;

          await storage.createActivityLog(userId, {
            type: 'trade_execution',
            level: 'error',
            message: `⚠️ Balance mismatch detected! Delta: ${deltaPercent.toFixed(2)}%`,
            metadata: {
              expected: expectedAmount.toString(),
              actual: actualBalance.toString(),
              delta: delta.toString(),
              deltaPercent,
            },
          });

          if (deltaPercent > 1.0) {
            // Critical mismatch - activate circuit breaker
            await storage.createCircuitBreakerEvent(userId, {
              reason: 'balance_mismatch',
              triggerValue: deltaPercent.toString(),
              thresholdValue: '1.0',
            });

            await storage.updateBotStatus(userId, {
              isPaused: true,
              pauseReason: `Balance mismatch: ${deltaPercent.toFixed(2)}%`,
            });
          }
        }
      } catch (error: any) {
        console.error('Balance reconciliation failed:', error);
      }

      // Send Telegram notification
      await sendTelegramMessage(
        userId,
        `🚀 <b>РЕАЛЬНАЯ ТОРГОВЛЯ: Сделка отправлена</b>\n\n` +
        `💹 Пара: ${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}\n` +
        `📊 DEX: ${opportunity.buyDex} → ${opportunity.sellDex}\n` +
        `💰 Ожидаемая прибыль: $${opportunity.estimatedProfitUsd.toFixed(2)}\n` +
        `⛽ Gas: ~$${opportunity.estimatedGasCostUsd.toFixed(2)}\n` +
        `🔗 TX: ${realTxHash}\n` +
        `⏳ Статус: Ожидание подтверждения...`,
        'trade_pending'
      );

      return {
        success: true,
        txHash: realTxHash,
        profitUsd: opportunity.estimatedProfitUsd,
        gasCostUsd: opportunity.estimatedGasCostUsd,
        message: `Real trade executed - TX ${realTxHash}`,
        executionTime: Date.now() - startTime,
      };

    } catch (error: any) {
      console.error('❌ Trade execution failed:', error.message);

      // Determine recommended action based on error
      let recommendation = 'Проверьте логи и настройки. При повторении ошибки обратитесь к документации.';
      let errorType = 'unknown';

      // Detailed trading diagnostics
      if (error.message.includes('not configured')) {
        recommendation = '⚠️ API ключи не настроены. Откройте Settings → Trading Parameters и добавьте необходимые ключи.';
        errorType = 'configuration';
      } else if (error.message.includes('Contract not deployed')) {
        recommendation = '⚠️ Контракт не развернут. Запустите: bash scripts/auto-fix-trading.sh';
        errorType = 'contract';
      } else if (error.message.includes('Token validation failed') && isSimulation) {
        recommendation = '✅ Это ОЖИДАЕМОЕ поведение в режиме симуляции.\n' +
          'На тестовой сети (Amoy) некоторые токены могут не иметь реального контракта.\n' +
          'Бот использует mock-данные для симуляции.\n\n' +
          '🔧 Действия:\n' +
          '1. Продолжайте работу - это не ошибка\n' +
          '2. Для реальной торговли переключитесь на mainnet в Settings\n' +
          '3. Убедитесь, что enableRealTrading = false для безопасности';
        errorType = 'simulation_token_validation';
      } else if (error.message.includes('Token validation failed')) {
        recommendation = 'Токен не прошел проверку безопасности:\n' +
          '1. Проверьте адрес токена в Settings → Token Pairs\n' +
          '2. Убедитесь, что токен развернут на текущей сети\n' +
          '3. Проверьте RPC URL (может быть проблема с доступом к блокчейну)\n' +
          '4. Используйте только проверенные токены (USDC, WMATIC, WETH и т.д.)';
        errorType = 'token_validation_failed';
      } else if (error.message.includes('1inch API key')) {
        recommendation = 'Получите бесплатный API ключ на https://portal.1inch.dev/ и добавьте в Settings → Trading Parameters';
        errorType = 'missing_api_key';
      } else if (error.message.includes('Private key')) {
        recommendation = 'Добавьте PRIVATE_KEY в Secrets или в Settings → Safe & Ledger';
        errorType = 'missing_private_key';
      } else if (error.message.includes('Gas price too high')) {
        recommendation = 'Дождитесь снижения цены газа или увеличьте лимит в Settings → Risk Management';
        errorType = 'gas_price_high';
      } else if (error.message.includes('Insufficient MATIC')) {
        recommendation = isSimulation
          ? 'Недостаточно MATIC для симуляции.\n' +
            '✅ В режиме симуляции это не критично - транзакции не отправляются.\n' +
            'Для реальной торговли пополните баланс MATIC.'
          : 'Пополните баланс MATIC для оплаты газа.\n' +
            'Минимум 0.1 MATIC требуется для выполнения сделок.';
        errorType = 'insufficient_balance';
      } else if (error.message.includes('missing revert data') || error.code === 'CALL_EXCEPTION') {
        recommendation = 'Смарт-контракт отклонил транзакцию. Возможные причины:\n' +
          '1. Ваш кошелек не авторизован в контракте ArbitrageExecutor\n' +
          '   - Выполните: npx tsx scripts/authorize-executor.ts (если вы owner)\n' +
          '2. Контракт ArbitrageExecutor не развернут (проверьте ARBITRAGE_CONTRACT в Secrets)\n' +
          '3. Недостаточная ликвидность на DEX для выполнения свопов\n' +
          '4. Slippage слишком низкий (1% может быть недостаточно)\n' +
          '5. Недостаточно токенов для покрытия flash loan fee\n\n' +
          '⚠️ РЕКОМЕНДАЦИЯ: Запустите в режиме симуляции (Settings → enableRealTrading: false)';
        errorType = 'contract_revert';
      } else if (error.message.includes('not deployed')) {
        recommendation = 'Разверните смарт-контракт ArbitrageExecutor:\n' +
          '1. Перейдите в папку contracts/\n' +
          '2. Выполните: npx hardhat run scripts/deploy.ts --network polygon\n' +
          '3. Добавьте адрес контракта в ARBITRAGE_CONTRACT (Secrets)';
        errorType = 'contract_not_deployed';
      }

      // Log error with recommendation
      await storage.createActivityLog(userId, {
        type: 'trade_execution',
        level: 'error',
        message: `❌ Ошибка исполнения сделки: ${error.message}`,
        metadata: {
          error: error.stack,
          errorType,
          errorCode: error.code,
          opportunity: opportunity.id,
          mode: isSimulation ? 'simulation' : 'real',
          recommendation,
          pair: `${opportunity.tokenIn.symbol}/${opportunity.tokenOut.symbol}`,
          expectedProfit: opportunity.estimatedProfitUsd,
        },
      });

      // Create failed transaction record with unique hash
      const failedTxHash = `0xfailed${Date.now().toString(16)}${Math.random().toString(16).substring(2)}`.substring(0, 66).padEnd(66, '0');

      await storage.createArbitrageTransaction(userId, {
        txHash: failedTxHash,
        tokenIn: opportunity.tokenIn.symbol,
        tokenOut: opportunity.tokenOut.symbol,
        amountIn: opportunity.flashLoanAmount,
        amountOut: '0',
        profitUsd: '0',
        gasCostUsd: '0',
        netProfitUsd: '0',
        status: 'failed',
        dexPath: `${opportunity.buyDex} → ${opportunity.sellDex}`,
      });

      // Логирование failed сделки в CSV
      tradeLogger.logTrade({
        timestamp: new Date().toISOString(),
        tradeId: opportunity.id,
        tokenIn: opportunity.tokenIn.symbol,
        tokenOut: opportunity.tokenOut.symbol,
        amountIn: opportunity.flashLoanAmount,
        amountOut: '0',
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        profitUsd: 0,
        gasCostUsd: 0,
        netProfitUsd: 0,
        netProfitPercent: 0,
        txHash: '0x0',
        status: 'failed',
        errorMessage: error.message,
      });

      // Обновление статистики с неуспешной сделкой
      await riskManager.updateDailyStats(userId, 0, 0, false);

      // Проверка circuit breaker
      const shouldBreak = await riskManager.checkCircuitBreaker(userId);
      if (shouldBreak && riskConfig.autoPauseEnabled) {
        await storage.updateBotStatus(userId, {
          isPaused: true,
          pauseReason: 'Circuit breaker activated due to consecutive failures',
        });
      }

      return {
        success: false,
        message: `Trade execution failed: ${error.message}`,
        error: error.message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate if opportunity is still profitable before executing
   */
  async validateOpportunity(
    userId: string,
    opportunity: ArbitrageOpportunity
  ): Promise<boolean> {
    try {
      const config = await storage.getBotConfig(userId);

      // Check if opportunity is still within time window (e.g., 30 seconds)
      const ageMs = Date.now() - opportunity.timestamp;
      if (ageMs > 30000) {
        console.log(`Opportunity too old: ${ageMs}ms`);
        return false;
      }

      // Check if profit is still above threshold
      if (opportunity.netProfitPercent < parseFloat(config?.minNetProfitPercent?.toString() || '0.15')) {
        console.log(`Profit below threshold: ${opportunity.netProfitPercent}%`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating opportunity:', error);
      return false;
    }
  }
}

// Export singleton instance
export const tradeExecutor = new TradeExecutor();
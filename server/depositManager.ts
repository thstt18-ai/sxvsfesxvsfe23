/**
 * Deposit Manager - автоматический перевод средств на указанный кошелек
 * После успешного вызова контракта весь депозит (100%) попадает на указанный кошелек
 */

import { ethers } from 'ethers';
import { storage } from './storage';
import { db } from './db';
import { eq, and } from 'drizzle-orm';
import { arbitrageTransactions } from '@shared/schema';

interface DepositTransferParams {
  userId: string;
  tokenAddress: string;
  amount: string;
  profitUsd: number;
  txHash: string;
}

class DepositManager {
  /**
   * Проверяет возможность обмена и переводит 100% средств на depositWallet
   * Шаги:
   * 1. Проверить getAmountsOut для расчета реального количества токенов
   * 2. Проверить price impact
   * 3. Проверить gas стоимость
   * 4. Только после этого перевести ВСЕ средства (100%)
   */
  async transferDeposit(params: DepositTransferParams): Promise<boolean> {
    const { userId, tokenAddress, amount, profitUsd, txHash } = params;

    try {
      // Получить конфигурацию пользователя
      const config = await storage.getBotConfig(userId);
      
      if (!config) {
        console.error('❌ Bot config not found for user:', userId);
        return false;
      }

      // Проверить включен ли автоперевод
      if (!config.autoTransferEnabled) {
        console.log('ℹ️  Auto-transfer disabled, skipping deposit transfer');
        return true;
      }

      // Проверить есть ли адрес кошелька
      if (!config.depositWalletAddress) {
        console.error('❌ Deposit wallet address not configured');
        return false;
      }

      // Проверить порог прибыли
      const transferThreshold = parseFloat(config.transferThresholdUsd?.toString() || '10');
      if (profitUsd < transferThreshold) {
        console.log(`ℹ️  Profit $${profitUsd.toFixed(2)} below threshold $${transferThreshold}, skipping transfer`);
        return true;
      }

      // Валидация адреса кошелька
      if (!ethers.isAddress(config.depositWalletAddress)) {
        console.error('❌ Invalid deposit wallet address:', config.depositWalletAddress);
        return false;
      }

      // Получить wallet из walletManager
      const { walletManager } = await import('./walletManager');
      const wallet = walletManager.getWallet(userId);
      
      if (!wallet) {
        console.error('❌ Wallet not initialized for user:', userId);
        return false;
      }

      // Подключиться к токену ERC20
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ],
        wallet
      );

      // Получить ВЕСЬ текущий баланс (100%)
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();

      console.log(`💰 Current balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      console.log(`📊 Transferring 100% of balance to deposit wallet`);

      if (balance === BigInt(0)) {
        console.error(`❌ Zero balance, nothing to transfer`);
        return false;
      }

      // Шаг 1: Проверить возможность обмена через getAmountsOut
      const { dexAggregator } = await import('./dexAggregator');
      const { DEX_ROUTERS } = await import('./dexAggregator');
      
      console.log('🔍 Checking swap feasibility with getAmountsOut...');
      
      // Проверяем основные DEX роутеры
      const routerAddress = DEX_ROUTERS['QuickSwap'];
      const routerContract = new ethers.Contract(
        routerAddress,
        ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'],
        wallet.provider
      );

      // Шаг 2: Проверить price impact
      const { priceImpactGuard } = await import('./priceImpactGuard');
      const marketPrice = 0.7; // TODO: получить из CoinGecko/1inch
      
      const priceCheck = await priceImpactGuard.checkPriceImpactFromRouter(
        routerAddress,
        balance,
        [tokenAddress, config.depositWalletAddress], // path
        wallet.provider,
        marketPrice
      );

      if (!priceCheck.safe) {
        console.error(`❌ Price impact too high: ${priceCheck.reason}`);
        return false;
      }

      console.log(`✅ Price impact check passed: ${priceCheck.priceImpactPercent.toFixed(2)}%`);

      // Шаг 3: Проверить gas cost
      console.log('⛽ Estimating gas cost...');
      const gasLimit = await tokenContract.transfer.estimateGas(
        config.depositWalletAddress,
        balance // 100% баланса
      );

      const feeData = await wallet.provider.getFeeData();
      const gasCost = gasLimit * (feeData.gasPrice || BigInt(30000000000));
      const gasCostEth = ethers.formatEther(gasCost);
      
      console.log(`⛽ Estimated gas: ${gasLimit.toString()} units`);
      console.log(`💸 Gas cost: ${gasCostEth} MATIC`);

      // Проверить достаточность MATIC для gas
      const maticBalance = await wallet.provider.getBalance(wallet.address);
      if (maticBalance < gasCost) {
        console.error(`❌ Insufficient MATIC for gas. Have: ${ethers.formatEther(maticBalance)}, need: ${gasCostEth}`);
        return false;
      }

      // Шаг 4: Выполнить перевод 100% баланса
      console.log(`💸 Transferring 100% balance (${ethers.formatUnits(balance, decimals)} ${symbol}) to ${config.depositWalletAddress}...`);
      
      const tx = await tokenContract.transfer(
        config.depositWalletAddress,
        balance, // 100% баланса
        {
          gasLimit: gasLimit * BigInt(120) / BigInt(100), // +20% buffer
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          maxFeePerGas: feeData.maxFeePerGas
        }
      );

      console.log(`📝 Transfer transaction sent: ${tx.hash}`);
      
      // Ждать подтверждения
      const receipt = await tx.wait();
      
      if (receipt?.status === 1) {
        console.log(`✅ Deposit transferred successfully!`);
        console.log(`   Amount: ${ethers.formatUnits(balance, decimals)} ${symbol} (100%)`);
        console.log(`   To: ${config.depositWalletAddress}`);
        console.log(`   Tx: ${tx.hash}`);

        // Записать перевод в базу данных
        await this.logDepositTransfer({
          userId,
          tokenAddress,
          amount: ethers.formatUnits(balance, decimals),
          toAddress: config.depositWalletAddress,
          txHash: tx.hash,
          profitUsd,
          originalTxHash: txHash
        });

        return true;
      } else {
        console.error(`❌ Transfer transaction failed: ${tx.hash}`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error transferring deposit:', error);
      return false;
    }
  }

  /**
   * Возврат токенов на баланс пользователя
   */
  async returnToUserBalance(
    userId: string,
    tokenAddress: string,
    fromAddress: string
  ): Promise<boolean> {
    try {
      const config = await storage.getBotConfig(userId);
      if (!config?.depositWalletAddress) {
        console.error('❌ Deposit wallet not configured');
        return false;
      }

      const { walletManager } = await import('./walletManager');
      const wallet = walletManager.getWallet(userId);
      
      if (!wallet) {
        console.error('❌ Wallet not initialized');
        return false;
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address to, uint256 amount) returns (bool)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ],
        wallet
      );

      // Получить весь баланс с depositWallet
      const balance = await tokenContract.balanceOf(fromAddress);
      const decimals = await tokenContract.decimals();
      const symbol = await tokenContract.symbol();

      if (balance === BigInt(0)) {
        console.log('ℹ️  No balance to return');
        return true;
      }

      console.log(`🔄 Returning ${ethers.formatUnits(balance, decimals)} ${symbol} to user balance...`);

      const tx = await tokenContract.transfer(wallet.address, balance);
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        console.log(`✅ Tokens returned successfully: ${tx.hash}`);
        return true;
      } else {
        console.error(`❌ Return transaction failed: ${tx.hash}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error returning tokens:', error);
      return false;
    }
  }

  /**
   * Логирует перевод депозита в базу данных
   */
  private async logDepositTransfer(params: {
    userId: string;
    tokenAddress: string;
    amount: string;
    toAddress: string;
    txHash: string;
    profitUsd: number;
    originalTxHash: string;
  }) {
    try {
      await db.insert(arbitrageTransactions).values({
        userId: params.userId,
        status: 'completed',
        profitUsd: params.profitUsd.toFixed(2),
        txHash: params.txHash,
        executionMethod: 'deposit_transfer',
        createdAt: new Date()
      });

      console.log('✅ Deposit transfer logged to database');
    } catch (error) {
      console.error('⚠️  Failed to log deposit transfer:', error);
      // Не критично, перевод уже выполнен
    }
  }

  /**
   * Проверяет баланс депозитного кошелька
   */
  async checkDepositWalletBalance(
    userId: string,
    tokenAddress: string
  ): Promise<string | null> {
    try {
      const config = await storage.getBotConfig(userId);
      
      if (!config?.depositWalletAddress) {
        return null;
      }

      const { walletManager } = await import('./walletManager');
      const wallet = walletManager.getWallet(userId);
      
      if (!wallet) {
        return null;
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        wallet.provider
      );

      const balance = await tokenContract.balanceOf(config.depositWalletAddress);
      const decimals = await tokenContract.decimals();

      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error checking deposit wallet balance:', error);
      return null;
    }
  }
}

export const depositManager = new DepositManager();

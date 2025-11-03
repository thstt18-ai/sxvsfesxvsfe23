
import { ethers } from 'ethers';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storage } from './storage';

interface ApproveCache {
  [chainId: string]: {
    [tokenAddress: string]: {
      txHash: string;
      timestamp: number;
      spender: string;
    };
  };
}

export class ApproveManager {
  private cacheFilePath: string;
  private cache: ApproveCache;

  constructor() {
    this.cacheFilePath = join(process.cwd(), 'data', 'approved_tokens.json');
    this.cache = this.loadCache();
  }

  private loadCache(): ApproveCache {
    try {
      if (existsSync(this.cacheFilePath)) {
        const data = readFileSync(this.cacheFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading approve cache:', error);
    }
    return {};
  }

  private saveCache(): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        require('fs').mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving approve cache:', error);
    }
  }

  /**
   * Проверка, нужен ли approve для токена
   */
  async checkApproval(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    requiredAmount: bigint,
    provider: ethers.JsonRpcProvider,
    chainId: number
  ): Promise<{ needsApproval: boolean; currentAllowance: bigint }> {
    const checksumAddress = ethers.getAddress(tokenAddress);
    
    // Проверяем кеш
    const cached = this.cache[chainId]?.[checksumAddress];
    if (cached && cached.spender === spenderAddress) {
      // Проверяем, не истёк ли approve
      const tokenContract = new ethers.Contract(
        checksumAddress,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        provider
      );

      try {
        const currentAllowance = await tokenContract.allowance(ownerAddress, spenderAddress);
        
        if (currentAllowance >= requiredAmount) {
          console.log(`✅ Token ${checksumAddress} already approved (cached)`);
          return { needsApproval: false, currentAllowance };
        } else {
          // Кеш устарел
          console.log(`⚠️ Cached approve invalid, needs re-approval`);
          delete this.cache[chainId][checksumAddress];
          this.saveCache();
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }

    // Проверяем текущее allowance
    const tokenContract = new ethers.Contract(
      checksumAddress,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      provider
    );

    const currentAllowance = await tokenContract.allowance(ownerAddress, spenderAddress);

    return {
      needsApproval: currentAllowance < requiredAmount,
      currentAllowance,
    };
  }

  /**
   * Выполнение approve с точной суммой (не unlimited)
   */
  async executeApprove(
    userId: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
    wallet: ethers.Wallet,
    chainId: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const checksumAddress = ethers.getAddress(tokenAddress);
      
      const tokenContract = new ethers.Contract(
        checksumAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        wallet
      );

      console.log(`📝 Executing approve for ${checksumAddress}...`);
      console.log(`   Amount: ${ethers.formatUnits(amount, 18)}`);
      console.log(`   Spender: ${spenderAddress}`);

      const gasLimit = parseInt(process.env.APPROVE_GAS_LIMIT || '60000');
      const gasPrice = await wallet.provider!.getFeeData();

      const tx = await tokenContract.approve(spenderAddress, amount, {
        gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
      });

      console.log(`⏳ Approve transaction sent: ${tx.hash}`);
      console.log(`   Waiting for confirmation...`);

      const timeout = parseInt(process.env.APPROVE_TIMEOUT || '90');
      const receipt = await tx.wait(1, timeout * 1000);

      if (!receipt || receipt.status === 0) {
        throw new Error('Approve transaction failed or reverted');
      }

      console.log(`✅ Approve confirmed in block ${receipt.blockNumber}`);

      // Сохраняем в кеш
      if (!this.cache[chainId]) {
        this.cache[chainId] = {};
      }
      this.cache[chainId][checksumAddress] = {
        txHash: tx.hash,
        timestamp: Date.now(),
        spender: spenderAddress,
      };
      this.saveCache();

      // Логируем в Activity Feed
      await storage.createActivityLog(userId, {
        type: 'approve',
        level: 'success',
        message: `✅ Token approved: ${checksumAddress.substring(0, 10)}...`,
        metadata: {
          tokenAddress: checksumAddress,
          spender: spenderAddress,
          amount: amount.toString(),
          txHash: tx.hash,
        },
      });

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('❌ Approve failed:', error.message);

      // Критическая ошибка - отключаем LIVE торговлю
      await storage.createActivityLog(userId, {
        type: 'approve',
        level: 'error',
        message: `❌ КРИТИЧЕСКАЯ ОШИБКА APPROVE: ${error.message}`,
        metadata: {
          error: error.message,
          tokenAddress,
          recommendation: 'Реальная торговля автоматически отключена. Проверьте баланс MATIC и повторите.',
        },
      });

      // Останавливаем бота
      await storage.updateBotStatus(userId, {
        isPaused: true,
        pauseReason: `Approve failed: ${error.message}`,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Обеспечение approve перед торговлей
   */
  async ensureApproved(
    userId: string,
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    requiredAmount: bigint,
    wallet: ethers.Wallet,
    chainId: number
  ): Promise<{ approved: boolean; txHash?: string; error?: string }> {
    const provider = wallet.provider as ethers.JsonRpcProvider;

    // Проверяем, нужен ли approve
    const { needsApproval } = await this.checkApproval(
      tokenAddress,
      ownerAddress,
      spenderAddress,
      requiredAmount,
      provider,
      chainId
    );

    if (!needsApproval) {
      return { approved: true };
    }

    // Выполняем approve
    const result = await this.executeApprove(
      userId,
      tokenAddress,
      spenderAddress,
      requiredAmount,
      wallet,
      chainId
    );

    return {
      approved: result.success,
      txHash: result.txHash,
      error: result.error,
    };
  }

  /**
   * Сброс кеша (для тестирования)
   */
  resetCache(chainId?: number): void {
    if (chainId) {
      delete this.cache[chainId];
    } else {
      this.cache = {};
    }
    this.saveCache();
    console.log('✅ Approve cache reset');
  }
}

export const approveManager = new ApproveManager();

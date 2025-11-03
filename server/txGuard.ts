
import { ethers } from 'ethers';

export interface TxGuardConfig {
  maxSlippagePercent: number;
  deadlineSeconds: number;
  checkRevert: boolean;
  singleApprove: boolean;
}

export interface TxGuardResult {
  safe: boolean;
  reason?: string;
  adjustedParams?: any;
}

export class TxGuard {
  private config: TxGuardConfig;

  constructor() {
    this.config = {
      maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '2.0'),
      deadlineSeconds: parseInt(process.env.TX_DEADLINE_SECONDS || '300'),
      checkRevert: process.env.CHECK_REVERT !== 'false',
      singleApprove: process.env.SINGLE_APPROVE !== 'false',
    };
  }

  /**
   * Проверка параметров транзакции перед отправкой
   */
  validateTransaction(params: {
    fromAmount: string;
    expectedToAmount: string;
    minToAmount: string;
    deadline?: number;
  }): TxGuardResult {
    // 1. Проверка slippage
    const fromAmount = parseFloat(params.fromAmount);
    const expectedAmount = parseFloat(params.expectedToAmount);
    const minAmount = parseFloat(params.minToAmount);
    
    const slippagePercent = ((expectedAmount - minAmount) / expectedAmount) * 100;
    
    if (slippagePercent > this.config.maxSlippagePercent) {
      return {
        safe: false,
        reason: `Slippage ${slippagePercent.toFixed(2)}% превышает максимум ${this.config.maxSlippagePercent}%`,
      };
    }

    // 2. Проверка deadline
    const now = Math.floor(Date.now() / 1000);
    const deadline = params.deadline || (now + this.config.deadlineSeconds);
    
    if (deadline <= now) {
      return {
        safe: false,
        reason: 'Deadline транзакции уже истек',
      };
    }

    if (deadline > now + this.config.deadlineSeconds) {
      return {
        safe: false,
        reason: `Deadline ${deadline - now}s превышает максимум ${this.config.deadlineSeconds}s`,
      };
    }

    return {
      safe: true,
      adjustedParams: {
        minToAmount: minAmount.toString(),
        deadline,
      },
    };
  }

  /**
   * Проверка approve перед транзакцией
   */
  async checkApproval(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string,
    requiredAmount: bigint,
    provider: ethers.JsonRpcProvider
  ): Promise<{ needsApproval: boolean; currentAllowance: bigint }> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
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
   * Создание безопасного approve (точная сумма, не unlimited)
   */
  async createSafeApprove(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
    wallet: ethers.Wallet
  ): Promise<ethers.ContractTransaction> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      wallet
    );

    // Используем точную сумму, а не максимальное значение uint256
    return await tokenContract.approve(spenderAddress, amount);
  }

  /**
   * Симуляция транзакции для проверки revert
   */
  async simulateTransaction(
    tx: ethers.TransactionRequest,
    provider: ethers.JsonRpcProvider
  ): Promise<TxGuardResult> {
    if (!this.config.checkRevert) {
      return { safe: true };
    }

    try {
      await provider.call(tx);
      return { safe: true };
    } catch (error: any) {
      return {
        safe: false,
        reason: `Симуляция показала revert: ${error.message}`,
      };
    }
  }

  /**
   * Расчет минимальной суммы с учетом slippage
   */
  calculateMinAmount(expectedAmount: string, slippagePercent?: number): string {
    const slippage = slippagePercent || this.config.maxSlippagePercent;
    const expected = parseFloat(expectedAmount);
    const minAmount = expected * (1 - slippage / 100);
    return minAmount.toFixed(6);
  }

  /**
   * Получение deadline для транзакции
   */
  getDeadline(): number {
    return Math.floor(Date.now() / 1000) + this.config.deadlineSeconds;
  }
}

export const txGuard = new TxGuard();

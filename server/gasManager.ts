import { ethers } from 'ethers';

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedCostUsd: number;
  safe: boolean;
  reason?: string;
}

export class GasManager {
  private maticPriceUsd: number;
  private maxGasFeeUsd: number;

  constructor() {
    this.maticPriceUsd = parseFloat(process.env.MATIC_PRICE_USD || '0.7');
    this.maxGasFeeUsd = parseFloat(process.env.MAX_GAS_FEE_USD || '1.0');
  }

  /**
   * Динамический расчёт газа с множителем
   */
  async estimateGas(
    provider: ethers.JsonRpcProvider,
    tx: ethers.TransactionRequest,
    operationType: 'swap' | 'approve' = 'swap'
  ): Promise<GasEstimate> {
    try {
      // Получаем текущую цену газа
      const feeData = await provider.getFeeData();

      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new Error('Failed to get fee data from provider');
      }

      // Умножаем на 1.15 для надёжности
      const maxFeePerGas = (feeData.maxFeePerGas * BigInt(115)) / BigInt(100);
      const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * BigInt(115)) / BigInt(100);

      // Определяем gas limit по типу операции
      let gasLimit: bigint;
      if (operationType === 'approve') {
        gasLimit = BigInt(process.env.APPROVE_GAS_LIMIT || '100000');
      } else {
        // Для swap используем высокий лимит
        gasLimit = BigInt(process.env.SWAP_GAS_LIMIT || '350000');
      }

      // Рассчитываем стоимость в USD
      const gasCostWei = gasLimit * maxFeePerGas;
      const gasCostMatic = parseFloat(ethers.formatEther(gasCostWei));
      const estimatedCostUsd = gasCostMatic * this.maticPriceUsd;

      // Проверяем лимит
      if (estimatedCostUsd > this.maxGasFeeUsd) {
        return {
          gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          estimatedCostUsd,
          safe: false,
          reason: `Gas cost $${estimatedCostUsd.toFixed(2)} exceeds limit $${this.maxGasFeeUsd}`,
        };
      }

      return {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        estimatedCostUsd,
        safe: true,
      };
    } catch (error: any) {
      console.error('Error estimating gas:', error);
      throw error;
    }
  }

  /**
   * Проверка, допустима ли текущая цена газа
   */
  async isGasPriceAcceptable(provider: ethers.JsonRpcProvider): Promise<boolean> {
    try {
      const feeData = await provider.getFeeData();
      if (!feeData.gasPrice) return false;

      const gasPriceGwei = parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei'));
      const maxGasPriceGwei = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '60');

      return gasPriceGwei <= maxGasPriceGwei;
    } catch (error) {
      console.error('Error checking gas price:', error);
      return false;
    }
  }

  /**
   * Обновление цены MATIC (можно вызывать периодически)
   */
  updateMaticPrice(priceUsd: number): void {
    this.maticPriceUsd = priceUsd;
    console.log(`📊 MATIC price updated: $${priceUsd.toFixed(4)}`);
  }
}

export const gasManager = new GasManager();
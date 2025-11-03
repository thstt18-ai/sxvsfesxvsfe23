
import { ethers } from 'ethers';

export interface PriceImpactCheck {
  safe: boolean;
  priceImpactPercent: number;
  expectedPrice: number;
  actualPrice: number;
  reason?: string;
}

export class PriceImpactGuard {
  private maxPriceImpactPercent: number;

  constructor() {
    this.maxPriceImpactPercent = parseFloat(process.env.MAX_PRICE_IMPACT_PERCENT || '1.0');
  }

  /**
   * Проверка price impact перед свопом
   */
  async checkPriceImpact(
    amountIn: string,
    expectedAmountOut: string,
    tokenInDecimals: number,
    tokenOutDecimals: number,
    marketPrice: number // Цена из CoinGecko или другого источника
  ): Promise<PriceImpactCheck> {
    try {
      const amountInFloat = parseFloat(ethers.formatUnits(amountIn, tokenInDecimals));
      const expectedAmountOutFloat = parseFloat(ethers.formatUnits(expectedAmountOut, tokenOutDecimals));

      // Рассчитываем фактическую цену из swap
      const actualPrice = expectedAmountOutFloat / amountInFloat;

      // Рассчитываем отклонение от рыночной цены
      const priceImpactPercent = Math.abs(((actualPrice - marketPrice) / marketPrice) * 100);

      if (priceImpactPercent > this.maxPriceImpactPercent) {
        return {
          safe: false,
          priceImpactPercent,
          expectedPrice: marketPrice,
          actualPrice,
          reason: `Price impact ${priceImpactPercent.toFixed(2)}% exceeds limit ${this.maxPriceImpactPercent}%`,
        };
      }

      return {
        safe: true,
        priceImpactPercent,
        expectedPrice: marketPrice,
        actualPrice,
      };
    } catch (error: any) {
      console.error('Error checking price impact:', error);
      return {
        safe: false,
        priceImpactPercent: 100,
        expectedPrice: marketPrice,
        actualPrice: 0,
        reason: `Price impact check failed: ${error.message}`,
      };
    }
  }

  /**
   * Проверка через getAmountsOut (для Uniswap V2-like DEX)
   */
  async checkPriceImpactFromRouter(
    routerAddress: string,
    amountIn: bigint,
    path: string[],
    provider: ethers.JsonRpcProvider,
    marketPrice: number
  ): Promise<PriceImpactCheck> {
    try {
      const routerContract = new ethers.Contract(
        routerAddress,
        [
          'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        ],
        provider
      );

      const amounts = await routerContract.getAmountsOut(amountIn, path);
      const expectedAmountOut = amounts[amounts.length - 1];

      return this.checkPriceImpact(
        amountIn.toString(),
        expectedAmountOut.toString(),
        18, // Предполагаем 18 decimals
        18,
        marketPrice
      );
    } catch (error: any) {
      console.error('Error checking price impact from router:', error);
      return {
        safe: false,
        priceImpactPercent: 100,
        expectedPrice: marketPrice,
        actualPrice: 0,
        reason: `Router price check failed: ${error.message}`,
      };
    }
  }
}

export const priceImpactGuard = new PriceImpactGuard();


import { dexAggregator } from "./dexAggregator";

interface SpreadCheckResult {
  isAcceptable: boolean;
  spreadPercent: number;
  reason?: string;
}

class SpreadGuard {
  private readonly MAX_SPREAD_PERCENT = 1.0; // 1% maximum spread

  async checkSpread(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<SpreadCheckResult> {
    try {
      // Get quote for the swap
      const quote = await dexAggregator.getQuote({
        src: tokenIn,
        dst: tokenOut,
        amount: amountIn,
      });

      if (!quote || !quote.toAmount) {
        return {
          isAcceptable: false,
          spreadPercent: 0,
          reason: "Failed to get quote",
        };
      }

      // Calculate implied price
      const inputAmount = parseFloat(amountIn);
      const outputAmount = parseFloat(quote.toAmount);
      
      if (inputAmount === 0 || outputAmount === 0) {
        return {
          isAcceptable: false,
          spreadPercent: 0,
          reason: "Invalid amounts",
        };
      }

      // Get spot price (reverse quote with minimal amount)
      const spotQuote = await dexAggregator.getQuote({
        src: tokenIn,
        dst: tokenOut,
        amount: "1000000", // 1 USDC for spot reference
      });

      if (!spotQuote || !spotQuote.toAmount) {
        return {
          isAcceptable: false,
          spreadPercent: 0,
          reason: "Failed to get spot price",
        };
      }

      const spotPrice = parseFloat(spotQuote.toAmount) / 1000000;
      const executionPrice = outputAmount / inputAmount;

      // Calculate spread as deviation from spot price
      const spreadPercent = Math.abs((executionPrice - spotPrice) / spotPrice) * 100;

      const isAcceptable = spreadPercent <= this.MAX_SPREAD_PERCENT;

      return {
        isAcceptable,
        spreadPercent,
        reason: isAcceptable ? undefined : `Spread ${spreadPercent.toFixed(2)}% exceeds ${this.MAX_SPREAD_PERCENT}%`,
      };
    } catch (error: any) {
      console.error("Spread check failed:", error);
      return {
        isAcceptable: false,
        spreadPercent: 0,
        reason: error.message || "Spread check error",
      };
    }
  }
}

export const spreadGuard = new SpreadGuard();

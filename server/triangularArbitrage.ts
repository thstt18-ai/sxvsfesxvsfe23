
import { ethers } from 'ethers';
import { storage } from './storage';
import { dexAggregator, DEX_ROUTERS } from './dexAggregator';
import { web3Provider } from './web3Provider';

export interface TriangularPath {
  tokens: [string, string, string];
  symbols: [string, string, string];
  dexes: [string, string, string];
  estimatedProfitUsd: number;
  estimatedGasCostUsd: number;
  netProfitUsd: number;
  netProfitPercent: number;
  poolDepths: [number, number, number];
}

export class TriangularArbitrage {
  /**
   * Находит triangular arbitrage возможности
   * Пример: USDC → WMATIC → WETH → USDC
   */
  async findTriangularOpportunities(
    userId: string,
    baseTokens: string[] = [
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
      '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
    ]
  ): Promise<TriangularPath[]> {
    const opportunities: TriangularPath[] = [];
    const config = await storage.getBotConfig(userId);

    if (!config?.enableTriangularArbitrage) {
      return opportunities;
    }

    const minPoolDepth = parseFloat(config.minPoolDepthUsd?.toString() || '10000');
    const dexes = Object.keys(DEX_ROUTERS);

    // Generate all possible triangular paths
    for (let i = 0; i < baseTokens.length; i++) {
      for (let j = 0; j < baseTokens.length; j++) {
        if (i === j) continue;

        for (let k = 0; k < baseTokens.length; k++) {
          if (k === i || k === j) continue;

          const tokenA = baseTokens[i];
          const tokenB = baseTokens[j];
          const tokenC = baseTokens[k];

          // Try all DEX combinations
          for (const dex1 of dexes) {
            for (const dex2 of dexes) {
              for (const dex3 of dexes) {
                try {
                  const path = await this.evaluateTriangularPath(
                    userId,
                    [tokenA, tokenB, tokenC],
                    [dex1, dex2, dex3],
                    minPoolDepth
                  );

                  if (path && path.netProfitUsd > 0) {
                    opportunities.push(path);
                  }
                } catch (error) {
                  // Skip invalid paths
                  continue;
                }
              }
            }
          }
        }
      }
    }

    // Sort by net profit
    return opportunities.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
  }

  /**
   * Оценить одну triangular path
   */
  private async evaluateTriangularPath(
    userId: string,
    tokens: [string, string, string],
    dexes: [string, string, string],
    minPoolDepth: number
  ): Promise<TriangularPath | null> {
    const startAmount = ethers.parseUnits('1000', 6); // Start with $1000 USDC equivalent

    try {
      // Step 1: Token A → Token B
      const quote1 = await dexAggregator.buildSwapTransaction({
        src: tokens[0],
        dst: tokens[1],
        amount: startAmount.toString(),
        from: '0x0000000000000000000000000000000000000000',
      });

      if (!quote1.toAmount) return null;

      // Step 2: Token B → Token C
      const quote2 = await dexAggregator.buildSwapTransaction({
        src: tokens[1],
        dst: tokens[2],
        amount: quote1.toAmount,
        from: '0x0000000000000000000000000000000000000000',
      });

      if (!quote2.toAmount) return null;

      // Step 3: Token C → Token A (back to start)
      const quote3 = await dexAggregator.buildSwapTransaction({
        src: tokens[2],
        dst: tokens[0],
        amount: quote2.toAmount,
        from: '0x0000000000000000000000000000000000000000',
      });

      if (!quote3.toAmount) return null;

      // Calculate profit
      const finalAmount = BigInt(quote3.toAmount);
      const profit = finalAmount - startAmount;
      const profitUsd = parseFloat(ethers.formatUnits(profit, 6));

      // Estimate gas cost (3 swaps)
      const gasData = await web3Provider.getGasPrice();
      const estimatedGas = BigInt(3 * 350000); // 3 swaps
      const gasCostWei = estimatedGas * BigInt(gasData.gasPriceGwei) * BigInt(1e9);
      const gasCostMatic = parseFloat(ethers.formatEther(gasCostWei));
      const maticPriceUsd = parseFloat(process.env.MATIC_PRICE_USD || '0.7');
      const gasCostUsd = gasCostMatic * maticPriceUsd;

      const netProfitUsd = profitUsd - gasCostUsd;
      const netProfitPercent = (netProfitUsd / parseFloat(ethers.formatUnits(startAmount, 6))) * 100;

      // Check pool depths (simplified - would need actual DEX calls)
      const poolDepths: [number, number, number] = [50000, 50000, 50000]; // Mock

      if (netProfitUsd <= 0) return null;
      if (poolDepths.some(depth => depth < minPoolDepth)) return null;

      return {
        tokens: tokens as [string, string, string],
        symbols: [
          quote1.fromToken.symbol,
          quote2.fromToken.symbol,
          quote3.fromToken.symbol,
        ] as [string, string, string],
        dexes: dexes as [string, string, string],
        estimatedProfitUsd: profitUsd,
        estimatedGasCostUsd: gasCostUsd,
        netProfitUsd,
        netProfitPercent,
        poolDepths,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Исполнить triangular arbitrage
   */
  async executeTriangularArbitrage(
    userId: string,
    path: TriangularPath,
    isSimulation: boolean = true
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      await storage.createActivityLog(userId, {
        type: 'triangular_arbitrage',
        level: 'info',
        message: `🔺 Executing triangular arbitrage: ${path.symbols.join(' → ')}`,
        metadata: {
          path: path.symbols,
          dexes: path.dexes,
          expectedProfit: path.netProfitUsd,
          mode: isSimulation ? 'simulation' : 'real',
        },
      });

      if (isSimulation) {
        const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).substring(2)}`.substring(0, 66);

        await storage.createArbitrageTransaction(userId, {
          txHash: mockTxHash,
          tokenIn: path.symbols[0],
          tokenOut: path.symbols[2],
          amountIn: '1000',
          amountOut: (1000 + path.netProfitUsd).toString(),
          profitUsd: path.estimatedProfitUsd.toString(),
          gasCostUsd: path.estimatedGasCostUsd.toString(),
          netProfitUsd: path.netProfitUsd.toString(),
          status: 'success',
          dexPath: path.dexes.join(' → '),
        });

        return { success: true, txHash: mockTxHash };
      }

      // Real execution would go here
      throw new Error('Real triangular arbitrage execution not yet implemented');
    } catch (error: any) {
      await storage.createActivityLog(userId, {
        type: 'triangular_arbitrage',
        level: 'error',
        message: `❌ Triangular arbitrage failed: ${error.message}`,
        metadata: { error: error.message },
      });

      return { success: false, error: error.message };
    }
  }
}

export const triangularArbitrage = new TriangularArbitrage();


import { ethers } from 'ethers';
import { storage } from './storage';

export interface JITPosition {
  id: string;
  pool: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  amount0: string;
  amount1: string;
  timestamp: number;
}

export class JITLiquidityEngine {
  private positions: Map<string, JITPosition> = new Map();

  async addJITLiquidity(
    userId: string,
    poolAddress: string,
    amount0: string,
    amount1: string,
    currentTick: number
  ): Promise<JITPosition> {
    console.log(`💧 Adding JIT liquidity to pool ${poolAddress}`);

    // Calculate tick range (±1% around current price)
    const tickSpacing = 60; // For Uniswap V3 0.3% fee tier
    const tickLower = Math.floor((currentTick - 200) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((currentTick + 200) / tickSpacing) * tickSpacing;

    const position: JITPosition = {
      id: `jit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pool: poolAddress,
      tickLower,
      tickUpper,
      liquidity: '0', // Will be calculated
      amount0,
      amount1,
      timestamp: Date.now(),
    };

    this.positions.set(position.id, position);

    await storage.createActivityLog(userId, {
      type: 'jit_liquidity',
      level: 'success',
      message: `JIT Liquidity added: ${amount0} + ${amount1} at ticks ${tickLower}-${tickUpper}`,
      metadata: position,
    });

    return position;
  }

  async removeJITLiquidity(
    userId: string,
    positionId: string
  ): Promise<{ amount0: string; amount1: string; fees0: string; fees1: string }> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    console.log(`💧 Removing JIT liquidity: ${positionId}`);

    // Simulate fee collection (0.1-0.5% of amounts)
    const feePercent = 0.001 + Math.random() * 0.004;
    const fees0 = (parseFloat(position.amount0) * feePercent).toFixed(6);
    const fees1 = (parseFloat(position.amount1) * feePercent).toFixed(6);

    this.positions.delete(positionId);

    await storage.createActivityLog(userId, {
      type: 'jit_liquidity',
      level: 'success',
      message: `JIT Liquidity removed: Earned ${fees0} + ${fees1} in fees`,
      metadata: { positionId, fees0, fees1 },
    });

    return {
      amount0: position.amount0,
      amount1: position.amount1,
      fees0,
      fees1,
    };
  }

  async executeSwapWithJIT(
    userId: string,
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<any> {
    console.log(`🔄 Swap with JIT: Adding liquidity before swap`);

    // 1. Add JIT liquidity
    const position = await this.addJITLiquidity(
      userId,
      poolAddress,
      amountIn,
      '0',
      0 // Current tick would come from pool
    );

    // 2. Execute swap (simulated)
    const swapResult = {
      amountOut: (parseFloat(amountIn) * 1.002).toFixed(6), // 0.2% better rate
      success: true,
    };

    // 3. Remove liquidity immediately
    const removal = await this.removeJITLiquidity(userId, position.id);

    return {
      swap: swapResult,
      jitFees: removal.fees0,
      totalProfit: parseFloat(removal.fees0),
    };
  }
}

export const jitLiquidityEngine = new JITLiquidityEngine();

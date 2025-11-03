
import { ethers } from 'ethers';
import { storage } from './storage';
import { walletManager } from './walletManager';

// QuickSwap Router на Polygon
const QUICKSWAP_ROUTER = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
// Uniswap V3 SwapRouter на Polygon
const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

const ROUTER_ABI = [
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

const UNISWAP_V3_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageTolerance: number; // 0.5 = 0.5%
  recipient?: string;
  deadline?: number; // seconds from now
  dex?: 'quickswap' | 'uniswap_v3';
}

export interface SwapQuote {
  amountOut: bigint;
  path: string[];
  priceImpact: number;
  estimatedGas: bigint;
  dex: string;
  route: string;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  amountOut?: bigint;
  gasUsed?: bigint;
  error?: string;
}

export class DEXSwapEngine {
  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;

  /**
   * Initialize DEX engine with wallet
   */
  async initialize(userId: string, chainId: number): Promise<void> {
    await walletManager.initialize(userId, chainId);
    this.provider = walletManager.getProvider();
    this.wallet = walletManager.getWallet();

    await storage.createActivityLog(userId, {
      type: 'dex_engine',
      level: 'info',
      message: `✅ DEX Swap Engine initialized (QuickSwap + Uniswap V3)`,
      metadata: { chainId },
    });
  }

  /**
   * Get quote from QuickSwap
   */
  async getQuickSwapQuote(params: SwapParams): Promise<SwapQuote> {
    if (!this.provider) {
      throw new Error('DEX engine not initialized');
    }

    const { tokenIn, tokenOut, amountIn } = params;
    const path = [tokenIn, tokenOut];

    const router = new ethers.Contract(QUICKSWAP_ROUTER, ROUTER_ABI, this.provider);

    try {
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOut = amounts[1];

      // Simple price impact calculation (can be improved with pool reserves)
      const priceImpact = 0.1; // TODO: Calculate actual price impact from pool

      const estimatedGas = await this.estimateSwapGas(params, 'quickswap');

      return {
        amountOut,
        path,
        priceImpact,
        estimatedGas,
        dex: 'QuickSwap',
        route: `${path.join(' → ')}`
      };
    } catch (error: any) {
      throw new Error(`QuickSwap quote failed: ${error.message}`);
    }
  }

  /**
   * Get quote from multiple DEXs and return best
   */
  async getBestQuote(params: SwapParams): Promise<SwapQuote> {
    const quotes: SwapQuote[] = [];

    // Try QuickSwap
    try {
      const quickswapQuote = await this.getQuickSwapQuote(params);
      quotes.push(quickswapQuote);
    } catch (error: any) {
      console.warn('QuickSwap quote failed:', error.message);
    }

    // TODO: Add Uniswap V3 quote

    if (quotes.length === 0) {
      throw new Error('No valid quotes from any DEX');
    }

    // Return quote with highest output
    return quotes.reduce((best, current) => 
      current.amountOut > best.amountOut ? current : best
    );
  }

  /**
   * Execute swap on QuickSwap
   */
  async executeQuickSwapSwap(params: SwapParams): Promise<SwapResult> {
    if (!this.wallet || !this.provider) {
      throw new Error('DEX engine not initialized');
    }

    const { tokenIn, tokenOut, amountIn, slippageTolerance, recipient, deadline } = params;

    // Get quote
    const quote = await this.getQuickSwapQuote(params);
    
    // Calculate minimum output with slippage
    const slippageMultiplier = BigInt(Math.floor((100 - slippageTolerance) * 100));
    const amountOutMin = (quote.amountOut * slippageMultiplier) / BigInt(10000);

    const path = [tokenIn, tokenOut];
    const to = recipient || this.wallet.address;
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + (deadline || 1200); // 20 minutes

    const router = new ethers.Contract(QUICKSWAP_ROUTER, ROUTER_ABI, this.wallet);

    try {
      console.log(`🔄 Executing QuickSwap swap: ${amountIn} ${tokenIn} -> ${tokenOut}`);
      console.log(`   Min output: ${amountOutMin} (slippage: ${slippageTolerance}%)`);
      
      const tx = await router.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        to,
        deadlineTimestamp
      );

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute swap on best DEX
   */
  async executeSwap(params: SwapParams): Promise<SwapResult> {
    // For now, use QuickSwap by default
    return await this.executeQuickSwapSwap(params);
  }

  /**
   * Estimate gas for swap
   */
  async estimateSwapGas(params: SwapParams, dex: 'quickswap' | 'uniswap_v3' = 'quickswap'): Promise<bigint> {
    if (!this.wallet || !this.provider) {
      throw new Error('DEX engine not initialized');
    }

    const { tokenIn, tokenOut, amountIn } = params;
    const path = [tokenIn, tokenOut];
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + 1200;

    try {
      if (dex === 'quickswap') {
        const router = new ethers.Contract(QUICKSWAP_ROUTER, ROUTER_ABI, this.wallet);
        
        const gasEstimate = await router.swapExactTokensForTokens.estimateGas(
          amountIn,
          0, // amountOutMin = 0 for estimation
          path,
          this.wallet.address,
          deadlineTimestamp
        );

        return gasEstimate;
      }
    } catch (error) {
      // Fallback to fixed value
      return BigInt(250000);
    }

    return BigInt(250000);
  }

  /**
   * Approve token for swap
   */
  async approveToken(userId: string, tokenAddress: string, amount: bigint): Promise<ethers.TransactionResponse> {
    console.log(`📝 Approving ${amount} of ${tokenAddress} for QuickSwap Router`);
    
    const tx = await walletManager.approveToken(tokenAddress, QUICKSWAP_ROUTER, amount);
    
    await storage.createActivityLog(userId, {
      type: 'dex_engine',
      level: 'info',
      message: `Token approval transaction sent: ${tx.hash}`,
      metadata: { tokenAddress, amount: amount.toString() },
    });

    return tx;
  }

  /**
   * Get router addresses
   */
  getRouterAddress(dex: 'quickswap' | 'uniswap_v3' = 'quickswap'): string {
    return dex === 'quickswap' ? QUICKSWAP_ROUTER : UNISWAP_V3_ROUTER;
  }

  /**
   * Calculate price impact
   */
  async calculatePriceImpact(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<number> {
    // TODO: Implement actual price impact calculation using pool reserves
    // For now, return estimated value
    return 0.1; // 0.1%
  }
}

export const dexSwapEngine = new DEXSwapEngine();

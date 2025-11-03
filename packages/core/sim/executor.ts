
```typescript
import type { CoreConfig, TradeOrder, TradeResult } from '../src/types';
import { SimWallet } from './wallet';

export class SimExecutor {
  private config: CoreConfig;
  private wallet: SimWallet;

  constructor(config: CoreConfig) {
    this.config = config;
    this.wallet = new SimWallet(config);
  }

  async swap(order: TradeOrder): Promise<TradeResult> {
    const balanceIn = parseFloat(this.wallet.balanceOf(order.tokenIn));
    const amountIn = parseFloat(order.amountIn);

    if (balanceIn < amountIn) {
      return {
        success: false,
        price: 0,
        amount: '0',
        error: 'Insufficient balance'
      };
    }

    // Simulate 0.1% fee
    const fee = amountIn * 0.001;
    const amountOut = amountIn - fee;

    // Update balances in memory
    this.wallet.updateBalance(order.tokenIn, (balanceIn - amountIn).toString());
    const balanceOut = parseFloat(this.wallet.balanceOf(order.tokenOut));
    this.wallet.updateBalance(order.tokenOut, (balanceOut + amountOut).toString());

    return {
      success: true,
      txHash: `0xsim${Date.now()}`,
      price: 1.0,
      amount: amountOut.toString(),
      gasUsed: 0
    };
  }
}
```

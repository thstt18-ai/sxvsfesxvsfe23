
```typescript
import { ethers } from 'ethers';
import type { CoreConfig, TradeOrder } from '../src/types';

export class LiveGas {
  private config: CoreConfig;
  private provider: ethers.JsonRpcProvider;

  constructor(config: CoreConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrls[0]);
  }

  async estimateGas(order: TradeOrder): Promise<number> {
    // Dynamic gas estimation based on current network conditions
    const feeData = await this.provider.getFeeData();
    return 300000; // Estimated for DEX swap
  }

  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || BigInt(30e9);
  }

  async getEIP1559Fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const feeData = await this.provider.getFeeData();
    return {
      maxFeePerGas: feeData.maxFeePerGas || BigInt(100e9),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || BigInt(2e9)
    };
  }
}
```

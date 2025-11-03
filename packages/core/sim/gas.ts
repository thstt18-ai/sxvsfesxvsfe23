
```typescript
import type { CoreConfig, TradeOrder } from '../src/types';

export class SimGas {
  private config: CoreConfig;

  constructor(config: CoreConfig) {
    this.config = config;
  }

  async estimateGas(order: TradeOrder): Promise<number> {
    // Fixed 150k gas for simulation
    return 150000;
  }

  getGasPrice(): number {
    // Fixed 30 Gwei for simulation
    return 30;
  }
}
```

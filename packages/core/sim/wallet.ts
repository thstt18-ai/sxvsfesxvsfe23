
```typescript
import type { CoreConfig } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

export class SimWallet {
  private config: CoreConfig;
  private balances: Map<string, string>;
  private balancesFile: string;

  constructor(config: CoreConfig) {
    this.config = config;
    this.balances = new Map();
    this.balancesFile = path.join(__dirname, '../../data/sim-balances.json');
    this.loadBalances();
  }

  private loadBalances(): void {
    try {
      if (fs.existsSync(this.balancesFile)) {
        const data = JSON.parse(fs.readFileSync(this.balancesFile, 'utf-8'));
        this.balances = new Map(Object.entries(data));
      } else {
        // Initialize with default balances
        this.balances.set('USDC', '10000');
        this.balances.set('USDT', '10000');
        this.balances.set('DAI', '10000');
        this.saveBalances();
      }
    } catch (error) {
      console.error('Failed to load balances:', error);
    }
  }

  private saveBalances(): void {
    try {
      const data = Object.fromEntries(this.balances);
      const dir = path.dirname(this.balancesFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.balancesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save balances:', error);
    }
  }

  balanceOf(token: string): string {
    return this.balances.get(token) || '0';
  }

  updateBalance(token: string, amount: string): void {
    this.balances.set(token, amount);
    this.saveBalances();
  }
}
```

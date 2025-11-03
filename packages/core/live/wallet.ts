
```typescript
import { ethers } from 'ethers';
import type { CoreConfig } from '../src/types';

export class LiveWallet {
  private config: CoreConfig;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;

  constructor(config: CoreConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrls[0]);
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not set for live trading');
    }
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  async balanceOf(token: string): Promise<string> {
    const tokenConfig = this.config.tokens[token];
    if (!tokenConfig) {
      throw new Error(`Token ${token} not found in config`);
    }

    const contract = new ethers.Contract(
      tokenConfig.address,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );

    const balance = await contract.balanceOf(this.wallet.address);
    return ethers.formatUnits(balance, tokenConfig.decimals);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  getSigner(): ethers.Wallet {
    return this.wallet;
  }
}
```

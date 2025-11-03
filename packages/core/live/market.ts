
```typescript
import axios from 'axios';
import type { CoreConfig, MarketQuote } from '../src/types';

export class LiveMarket {
  private config: CoreConfig;
  private apiKey?: string;

  constructor(config: CoreConfig) {
    this.config = config;
    this.apiKey = process.env.ONEINCH_API_KEY;
  }

  async getQuote(pair: string): Promise<MarketQuote> {
    const [tokenIn, tokenOut] = pair.split('/');
    
    try {
      const headers: any = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.get(
        `https://api.1inch.dev/swap/v6.0/137/quote`,
        {
          params: {
            src: this.config.tokens[tokenIn].address,
            dst: this.config.tokens[tokenOut].address,
            amount: '1000000' // 1 USDC
          },
          headers,
          timeout: 10000
        }
      );

      return {
        pair,
        price: parseFloat(response.data.toAmount) / 1e6,
        source: '1inch',
        timestamp: Date.now()
      };
    } catch (error: any) {
      throw new Error(`Failed to get quote: ${error.message}`);
    }
  }
}
```

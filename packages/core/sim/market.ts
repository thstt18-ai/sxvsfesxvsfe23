
```typescript
import axios from 'axios';
import type { CoreConfig, MarketQuote } from '../src/types';

export class SimMarket {
  private config: CoreConfig;

  constructor(config: CoreConfig) {
    this.config = config;
  }

  async getQuote(pair: string): Promise<MarketQuote> {
    // Use Binance REST API for price feeds (no auth required)
    try {
      const [base, quote] = pair.split('/');
      const symbol = `${base}${quote}`;
      
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { timeout: 5000 }
      );

      return {
        pair,
        price: parseFloat(response.data.price),
        source: 'Binance',
        timestamp: Date.now()
      };
    } catch (error) {
      // Fallback to mock price
      return {
        pair,
        price: 1.0 + Math.random() * 0.01,
        source: 'Mock',
        timestamp: Date.now()
      };
    }
  }
}
```

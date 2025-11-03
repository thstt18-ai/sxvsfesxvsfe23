
```typescript
export interface CoreConfig {
  mode: 'simulation' | 'live';
  rpcUrls: string[];
  tokens: {
    [symbol: string]: {
      address: string;
      decimals: number;
    };
  };
  riskLimits: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxSlippage: number;
  };
  gasLimits: {
    maxGasPrice: number;
    priorityFee: number;
  };
}

export interface TradeOrder {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: number;
  slippage: number;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  price: number;
  amount: string;
  gasUsed?: number;
  error?: string;
}

export interface MarketQuote {
  pair: string;
  price: number;
  source: string;
  timestamp: number;
}
```


```typescript
import type { CoreConfig } from './src/types';

export const coreConfig: CoreConfig = {
  mode: (process.env.TRADING_MODE as 'simulation' | 'live') || 'simulation',
  
  rpcUrls: [
    process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    'https://rpc-mainnet.matic.network',
    'https://polygon-mainnet.public.blastapi.io'
  ],
  
  tokens: {
    USDC: {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6
    },
    USDT: {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6
    },
    DAI: {
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      decimals: 18
    },
    WMATIC: {
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      decimals: 18
    },
    WETH: {
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18
    }
  },
  
  riskLimits: {
    maxPositionSize: 10000, // USD
    maxDailyLoss: 500, // USD
    maxSlippage: 1.0 // %
  },
  
  gasLimits: {
    maxGasPrice: 100, // Gwei
    priorityFee: 2 // Gwei
  }
};
```

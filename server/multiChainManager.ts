
import { ethers } from 'ethers';
import { storage } from './storage';

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
  dexRouters: {
    [key: string]: string;
  };
}

export const SUPPORTED_CHAINS: { [key: number]: ChainConfig } = {
  137: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockExplorer: 'https://polygonscan.com',
    dexRouters: {
      quickswap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      uniswap: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    },
  },
  56: {
    chainId: 56,
    name: 'BSC',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockExplorer: 'https://bscscan.com',
    dexRouters: {
      pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      uniswap: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
    },
  },
  42161: {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://arbiscan.io',
    dexRouters: {
      uniswap: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    },
  },
  43114: {
    chainId: 43114,
    name: 'Avalanche',
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    blockExplorer: 'https://snowtrace.io',
    dexRouters: {
      traderjoe: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
      pangolin: '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106',
    },
  },
};

export class MultiChainManager {
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();

  async initialize(): Promise<void> {
    for (const [chainId, config] of Object.entries(SUPPORTED_CHAINS)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        await provider.getBlockNumber(); // Test connection
        this.providers.set(Number(chainId), provider);
        console.log(`✅ Connected to ${config.name} (Chain ${chainId})`);
      } catch (error) {
        console.error(`❌ Failed to connect to ${config.name}:`, error);
      }
    }
  }

  getProvider(chainId: number): ethers.JsonRpcProvider | null {
    return this.providers.get(chainId) || null;
  }

  getChainConfig(chainId: number): ChainConfig | null {
    return SUPPORTED_CHAINS[chainId] || null;
  }

  async switchChain(userId: string, chainId: number): Promise<void> {
    const config = this.getChainConfig(chainId);
    if (!config) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    await storage.updateBotConfig(userId, {
      networkMode: chainId === 137 ? 'mainnet' : 'custom',
    });

    await storage.createActivityLog(userId, {
      type: 'chain_switch',
      level: 'info',
      message: `Switched to ${config.name} (Chain ${chainId})`,
      metadata: { chainId, chainName: config.name },
    });
  }

  getSupportedChains(): ChainConfig[] {
    return Object.values(SUPPORTED_CHAINS);
  }
}

export const multiChainManager = new MultiChainManager();

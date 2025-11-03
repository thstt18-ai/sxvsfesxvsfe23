
import { ethers } from 'ethers';

export type NetworkType = 'mainnet' | 'amoy' | 'mumbai';

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: string;
  isTestnet: boolean;
}

export const NETWORKS: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    name: 'Polygon Mainnet',
    chainId: 137,
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeToken: 'MATIC',
    isTestnet: false,
  },
  amoy: {
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpcUrl: 'https://rpc.ankr.com/polygon_amoy',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeToken: 'MATIC',
    isTestnet: true,
  },
  mumbai: {
    name: 'Polygon Mumbai Testnet',
    chainId: 80001,
    rpcUrl: 'https://rpc.ankr.com/polygon_mumbai',
    explorerUrl: 'https://mumbai.polygonscan.com',
    nativeToken: 'MATIC',
    isTestnet: true,
  },
};

export class NetworkManager {
  private currentNetwork: NetworkType = 'mainnet';
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(network: NetworkType = 'mainnet') {
    this.currentNetwork = network;
    this.initializeProvider();
  }

  private initializeProvider(): void {
    const config = NETWORKS[this.currentNetwork];
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.initializeProvider();
    }
    return this.provider!;
  }

  getCurrentNetwork(): NetworkType {
    return this.currentNetwork;
  }

  getNetworkConfig(): NetworkConfig {
    return NETWORKS[this.currentNetwork];
  }

  async switchNetwork(network: NetworkType): Promise<void> {
    this.currentNetwork = network;
    this.initializeProvider();
    
    // Verify connection
    try {
      const blockNumber = await this.provider!.getBlockNumber();
      console.log(`✅ Switched to ${network} - Block: ${blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to connect to ${network}:`, error);
      throw error;
    }
  }

  isTestnet(): boolean {
    return NETWORKS[this.currentNetwork].isTestnet;
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider!.getBalance(address);
    return ethers.formatEther(balance);
  }
}

export const networkManager = new NetworkManager();

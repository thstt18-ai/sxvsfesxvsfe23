
import { ethers } from 'ethers';
import { storage } from './storage';

export interface WalletConfig {
  type: 'private_key' | 'ledger' | 'metamask';
  privateKey?: string;
  ledgerPath?: string;
}

export class WalletManager {
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  /**
   * Initialize wallet from configuration
   */
  async initialize(userId: string, chainId: number): Promise<void> {
    const config = await storage.getBotConfig(userId);
    if (!config) {
      throw new Error('Bot configuration not found');
    }

    // Get RPC URL based on network
    const rpcUrl = chainId === 137 
      ? config.polygonRpcUrl 
      : config.polygonTestnetRpcUrl;

    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chainId ${chainId}`);
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl, {
      name: chainId === 137 ? 'Polygon' : 'Polygon Amoy',
      chainId
    });

    // Initialize wallet based on configuration
    const privateKey = config.privateKey?.trim() || process.env.PRIVATE_KEY;

    if (!privateKey) {
      throw new Error('Private key not configured. Set PRIVATE_KEY in environment or Settings.');
    }

    // Validate and normalize private key
    let normalizedKey = privateKey;
    if (!normalizedKey.startsWith('0x')) {
      normalizedKey = '0x' + normalizedKey;
    }

    if (normalizedKey.length !== 66) {
      throw new Error('Invalid private key format. Must be 64 hex characters (or 66 with 0x prefix)');
    }

    this.wallet = new ethers.Wallet(normalizedKey, this.provider);

    await storage.createActivityLog(userId, {
      type: 'wallet',
      level: 'info',
      message: `✅ Wallet initialized: ${this.wallet.address}`,
      metadata: {
        chainId,
        network: chainId === 137 ? 'mainnet' : 'testnet',
      },
    });
  }

  /**
   * Get wallet instance
   */
  getWallet(): ethers.Wallet {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }
    return this.wallet;
  }

  /**
   * Get provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }
    return this.provider;
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.getWallet().address;
  }

  /**
   * Sign transaction
   */
  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    const wallet = this.getWallet();
    return await wallet.signTransaction(tx);
  }

  /**
   * Send transaction
   */
  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const wallet = this.getWallet();
    return await wallet.sendTransaction(tx);
  }

  /**
   * Get native balance (MATIC)
   */
  async getNativeBalance(): Promise<bigint> {
    const provider = this.getProvider();
    const address = this.getAddress();
    return await provider.getBalance(address);
  }

  /**
   * Get ERC20 token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const provider = this.getProvider();
    const address = this.getAddress();

    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)'
    ];

    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    return await contract.balanceOf(address);
  }

  /**
   * Approve token spending
   */
  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ): Promise<ethers.TransactionResponse> {
    const wallet = this.getWallet();

    const erc20Abi = [
      'function approve(address spender, uint256 amount) returns (bool)'
    ];

    const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    return await contract.approve(spenderAddress, amount);
  }

  /**
   * Check if token is approved
   */
  async getAllowance(
    tokenAddress: string,
    spenderAddress: string
  ): Promise<bigint> {
    const provider = this.getProvider();
    const address = this.getAddress();

    const erc20Abi = [
      'function allowance(address owner, address spender) view returns (uint256)'
    ];

    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    return await contract.allowance(address, spenderAddress);
  }
}

export const walletManager = new WalletManager();

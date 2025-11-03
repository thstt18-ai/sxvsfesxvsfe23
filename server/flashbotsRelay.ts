import { ethers } from 'ethers';

const FLASHBOTS_RPC_URL = 'https://rpc.flashbots.net';

export class FlashbotsRelay {
  private enabled: boolean = false;
  private provider: ethers.JsonRpcProvider | null = null;

  async initialize(userId: string): Promise<void> {
    const { storage } = await import('./storage');
    const config = await storage.getBotConfig(userId);

    this.enabled = config?.useFlashbots || false;

    if (this.enabled) {
      this.provider = new ethers.JsonRpcProvider(FLASHBOTS_RPC_URL);
      console.log('✅ Flashbots Relay initialized');
    }
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.enabled || !this.provider) {
      throw new Error('Flashbots not enabled');
    }

    const { walletManager } = await import('./walletManager');
    const wallet = walletManager.getWallet();

    if (!wallet) {
      throw new Error('Wallet not initialized');
    }

    const connectedWallet = wallet.connect(this.provider);
    return await connectedWallet.sendTransaction(tx);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const flashbotsRelay = new FlashbotsRelay();
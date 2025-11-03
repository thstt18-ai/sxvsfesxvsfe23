
import { ethers } from 'ethers';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';

export class FlashbotsRelay {
  private provider: ethers.JsonRpcProvider;
  private flashbotsProvider: FlashbotsBundleProvider | null = null;
  private authSigner: ethers.Wallet;

  constructor(provider: ethers.JsonRpcProvider, authSigner: ethers.Wallet) {
    this.provider = provider;
    this.authSigner = authSigner;
  }

  async initialize(flashbotsRpcUrl: string = 'https://relay.flashbots.net'): Promise<void> {
    this.flashbotsProvider = await FlashbotsBundleProvider.create(
      this.provider,
      this.authSigner,
      flashbotsRpcUrl
    );
    console.log('✅ Flashbots relay initialized - MEV protection enabled');
  }

  async sendPrivateTransaction(
    transaction: ethers.TransactionRequest,
    targetBlockNumber?: number
  ): Promise<any> {
    if (!this.flashbotsProvider) {
      throw new Error('Flashbots provider not initialized');
    }

    const currentBlock = await this.provider.getBlockNumber();
    const targetBlock = targetBlockNumber || currentBlock + 1;

    const signedBundle = await this.flashbotsProvider.signBundle([
      {
        signer: this.authSigner,
        transaction
      }
    ]);

    const simulation = await this.flashbotsProvider.simulate(signedBundle, targetBlock);
    
    if ('error' in simulation) {
      throw new Error(`Simulation failed: ${simulation.error.message}`);
    }

    console.log(`📦 Sending private bundle to block ${targetBlock}`);
    const bundleSubmission = await this.flashbotsProvider.sendRawBundle(
      signedBundle,
      targetBlock
    );

    return bundleSubmission;
  }

  isEnabled(): boolean {
    return this.flashbotsProvider !== null;
  }
}

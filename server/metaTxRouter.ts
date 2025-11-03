
import { ethers } from 'ethers';

export class MetaTxRouter {
  private relayerKey: string | null = null;

  constructor() {
    this.relayerKey = process.env.RELAYER_PRIVATE_KEY || null;
  }

  async executeMetaTx(userAddress: string, txData: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.relayerKey) {
      throw new Error('RELAYER_PRIVATE_KEY not configured');
    }

    const { currentProvider } = await import('./web3Provider');
    const provider = currentProvider.getProvider();
    const relayer = new ethers.Wallet(this.relayerKey, provider);

    // Relayer pays gas for user
    const tx = {
      ...txData,
      from: relayer.address,
      gasLimit: txData.gasLimit || 500000
    };

    return await relayer.sendTransaction(tx);
  }

  isEnabled(): boolean {
    return !!this.relayerKey;
  }
}

export const metaTxRouter = new MetaTxRouter();
import { storage } from './storage';
import { walletManager } from './walletManager';

interface MetaTxRequest {
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  nonce: string;
  signature: string;
}

export class MetaTxRouter {
  private relayerWallet: ethers.Wallet | null = null;

  async initialize(userId: string, chainId: number): Promise<void> {
    await walletManager.initialize(userId, chainId);
    
    // Relayer wallet для оплаты gas
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (relayerKey) {
      const provider = walletManager.getProvider();
      this.relayerWallet = new ethers.Wallet(relayerKey, provider);
      
      await storage.createActivityLog(userId, {
        type: 'meta_tx',
        level: 'info',
        message: `✅ Meta-Transaction Router initialized (Relayer: ${this.relayerWallet.address})`,
        metadata: { chainId },
      });
    }
  }

  async executeMetaTx(userId: string, request: MetaTxRequest): Promise<ethers.TransactionResponse> {
    if (!this.relayerWallet) {
      throw new Error('Relayer wallet not initialized');
    }

    // Verify signature
    const domain = {
      name: 'ArbitrageBot',
      version: '1',
      chainId: (await this.relayerWallet.provider!.getNetwork()).chainId,
    };

    const types = {
      MetaTransaction: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'data', type: 'bytes' },
        { name: 'value', type: 'uint256' },
        { name: 'gas', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    };

    const value = {
      from: request.from,
      to: request.to,
      data: request.data,
      value: request.value,
      gas: request.gas,
      nonce: request.nonce,
    };

    const recoveredAddress = ethers.verifyTypedData(domain, types, value, request.signature);

    if (recoveredAddress.toLowerCase() !== request.from.toLowerCase()) {
      throw new Error('Invalid signature');
    }

    // Execute transaction through relayer
    const tx = await this.relayerWallet.sendTransaction({
      to: request.to,
      data: request.data,
      value: BigInt(request.value),
      gasLimit: BigInt(request.gas),
    });

    await storage.createActivityLog(userId, {
      type: 'meta_tx',
      level: 'success',
      message: `Meta-Transaction executed: ${tx.hash}`,
      metadata: { from: request.from, to: request.to, txHash: tx.hash },
    });

    return tx;
  }
}

export const metaTxRouter = new MetaTxRouter();

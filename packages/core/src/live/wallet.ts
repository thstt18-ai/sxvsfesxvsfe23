
import { ethers } from 'ethers';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import Eth from '@ledgerhq/hw-app-eth';

export interface WalletConfig {
  type: 'ledger' | 'keystore' | 'privateKey';
  path?: string;
  password?: string;
}

export class HardwareWallet {
  private signer: ethers.Signer | null = null;

  async connect(config: WalletConfig, provider: ethers.Provider): Promise<ethers.Signer> {
    if (config.type === 'ledger') {
      const transport = await TransportNodeHid.create();
      const eth = new Eth(transport);
      const derivationPath = config.path || "m/44'/60'/0'/0/0";
      
      const { address } = await eth.getAddress(derivationPath);
      
      this.signer = {
        getAddress: async () => address,
        signTransaction: async (tx: ethers.TransactionRequest) => {
          const serializedTx = ethers.Transaction.from(tx).unsignedSerialized;
          const signature = await eth.signTransaction(derivationPath, serializedTx.slice(2));
          return ethers.Transaction.from(tx).serialized;
        },
        connect: (provider: ethers.Provider) => this.signer!,
      } as any;
      
      return this.signer;
    } else if (config.type === 'keystore' && config.path && config.password) {
      const keystore = await import('fs').then(fs => fs.promises.readFile(config.path!, 'utf-8'));
      this.signer = await ethers.Wallet.fromEncryptedJson(keystore, config.password);
      return this.signer.connect(provider);
    } else {
      throw new Error('Unsupported wallet type');
    }
  }

  getSigner(): ethers.Signer {
    if (!this.signer) throw new Error('Wallet not connected');
    return this.signer;
  }
}

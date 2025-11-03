
import { ethers } from 'ethers';

export interface BatchOperation {
  user: string;
  amount: bigint;
}

export class BatchOperationsManager {
  private provider: ethers.JsonRpcProvider;
  private vaultAddress: string;
  private signer: ethers.Wallet;

  constructor(provider: ethers.JsonRpcProvider, vaultAddress: string, signer: ethers.Wallet) {
    this.provider = provider;
    this.vaultAddress = vaultAddress;
    this.signer = signer;
  }

  /**
   * Batch deposit multiple amounts in one transaction
   */
  async batchDeposit(operations: BatchOperation[]): Promise<ethers.TransactionReceipt> {
    const vaultAbi = [
      'function batchDeposit(address[] calldata users, uint256[] calldata amounts) external'
    ];

    const vault = new ethers.Contract(this.vaultAddress, vaultAbi, this.signer);

    const users = operations.map(op => op.user);
    const amounts = operations.map(op => op.amount);

    console.log(`📦 Batch depositing for ${operations.length} users...`);

    const tx = await vault.batchDeposit(users, amounts);
    const receipt = await tx.wait();

    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);
    const gasUsed = receipt?.gasUsed || 0n;
    const avgGasPerOp = operations.length > 0 ? Number(gasUsed) / operations.length : 0;

    console.log(`✅ Batch deposit complete: ${ethers.formatUnits(totalAmount, 6)} USDC`);
    console.log(`   Gas used: ${gasUsed.toString()} (avg ${avgGasPerOp.toFixed(0)} per operation)`);

    return receipt!;
  }

  /**
   * Batch withdraw multiple amounts in one transaction
   */
  async batchWithdraw(operations: BatchOperation[]): Promise<ethers.TransactionReceipt> {
    const vaultAbi = [
      'function batchWithdraw(address[] calldata users, uint256[] calldata amounts) external'
    ];

    const vault = new ethers.Contract(this.vaultAddress, vaultAbi, this.signer);

    const users = operations.map(op => op.user);
    const amounts = operations.map(op => op.amount);

    console.log(`📦 Batch withdrawing for ${operations.length} users...`);

    const tx = await vault.batchWithdraw(users, amounts);
    const receipt = await tx.wait();

    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);
    const gasUsed = receipt?.gasUsed || 0n;
    const avgGasPerOp = operations.length > 0 ? Number(gasUsed) / operations.length : 0;

    console.log(`✅ Batch withdraw complete: ${ethers.formatUnits(totalAmount, 6)} USDC`);
    console.log(`   Gas used: ${gasUsed.toString()} (avg ${avgGasPerOp.toFixed(0)} per operation)`);

    return receipt!;
  }
}

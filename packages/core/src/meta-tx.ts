
import { ethers } from 'ethers';

export interface PermitSignature {
  v: number;
  r: string;
  s: string;
  deadline: number;
}

export class MetaTxManager {
  private trustedForwarder: string;
  private signer: ethers.Wallet;

  constructor(trustedForwarder: string, signer: ethers.Wallet) {
    this.trustedForwarder = trustedForwarder;
    this.signer = signer;
  }

  /**
   * EIP-2612: Generate permit signature for gasless approval
   */
  async generatePermit(
    tokenAddress: string,
    spender: string,
    value: bigint,
    deadline: number,
    nonce: number
  ): Promise<PermitSignature> {
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: await this.signer.provider!.getNetwork().then(n => Number(n.chainId)),
      verifyingContract: tokenAddress
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ]
    };

    const message = {
      owner: this.signer.address,
      spender,
      value: value.toString(),
      nonce,
      deadline
    };

    const signature = await this.signer.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);

    return {
      v: sig.v,
      r: sig.r,
      s: sig.s,
      deadline
    };
  }

  /**
   * EIP-2771: Forward meta-transaction through trusted forwarder (gasless)
   */
  async forwardMetaTx(
    target: string,
    data: string,
    gas: bigint
  ): Promise<ethers.TransactionResponse> {
    const forwarderAbi = [
      'function execute(address to, bytes data, uint256 gas) external payable returns (bool, bytes)'
    ];

    const forwarder = new ethers.Contract(
      this.trustedForwarder,
      forwarderAbi,
      this.signer
    );

    return await forwarder.execute(target, data, gas);
  }

  /**
   * Gasless arbitrage execution with Permit + Meta-TX
   * User signs permit (no approve tx needed)
   * Relayer pays gas (user needs 0 MATIC)
   */
  async executeGaslessArbitrage(
    contractAddress: string,
    tokenAddress: string,
    amount: bigint,
    arbitrageParams: any
  ): Promise<ethers.TransactionResponse> {
    // Step 1: Generate permit signature (EIP-2612)
    const nonce = 0; // TODO: get from token contract
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const permitSig = await this.generatePermit(
      tokenAddress,
      contractAddress,
      amount,
      deadline,
      nonce
    );

    // Step 2: Encode arbitrage call with permit
    const arbitrageAbi = [
      'function executeArbitrageWithPermit(address asset, uint256 amount, tuple(tuple(address router, bytes data) buySwap, tuple(address router, bytes data) sellSwap, uint256 minProfit) params, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external'
    ];

    const iface = new ethers.Interface(arbitrageAbi);
    const data = iface.encodeFunctionData('executeArbitrageWithPermit', [
      tokenAddress,
      amount,
      arbitrageParams,
      permitSig.deadline,
      permitSig.v,
      permitSig.r,
      permitSig.s
    ]);

    // Step 3: Forward through meta-tx (relayer pays gas)
    return await this.forwardMetaTx(contractAddress, data, BigInt(500000));
  }

  getTrustedForwarder(): string {
    return this.trustedForwarder;
  }
}

import { ethers } from 'ethers';
import { getRpcUrl, getRpcFallbacks } from './rpcEndpoints';

export class Web3Provider {
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds
  private currentRpcIndex: Map<number, number> = new Map();

  private getDefaultRpcUrl(chainId: number): string {
    const preferredUrl = chainId === 137
      ? process.env.POLYGON_RPC_URL
      : process.env.POLYGON_TESTNET_RPC_URL;

    return getRpcUrl(chainId, preferredUrl);
  }

  private getNextRpcUrl(chainId: number): string {
    const fallbacks = getRpcFallbacks(chainId);
    const currentIndex = this.currentRpcIndex.get(chainId) || 0;
    const nextIndex = (currentIndex + 1) % fallbacks.length;

    this.currentRpcIndex.set(chainId, nextIndex);

    console.log(`Switching to fallback RPC [${nextIndex}]: ${fallbacks[nextIndex]}`);
    return fallbacks[nextIndex];
  }

  getProvider(chainId: number): ethers.JsonRpcProvider {
    const cacheKey = `provider_${chainId}`;

    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }

    const rpcUrl = this.getDefaultRpcUrl(chainId);

    // Configure with static network to avoid detection issues
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
      staticNetwork: ethers.Network.from(chainId),
      batchMaxCount: 1
    });

    this.providers.set(cacheKey, provider);
    return provider;
  }

  async getProviderWithRetry(chainId: number, maxRetries: number = 3): Promise<ethers.JsonRpcProvider> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const provider = this.getProvider(chainId);
        // Test connection
        await provider.getBlockNumber();
        return provider;
      } catch (error) {
        console.error(`RPC connection attempt ${i + 1} failed:`, error);

        if (i < maxRetries - 1) {
          // Clear cache and try next RPC
          this.providers.delete(`provider_${chainId}`);
          this.getNextRpcUrl(chainId);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`Failed to connect to RPC after ${maxRetries} attempts`);
  }

  async getPrice(tokenAddress: string, chainId: number): Promise<number> {
    const cacheKey = `${chainId}_${tokenAddress}`;
    const cached = this.priceCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }

    const provider = await this.getProviderWithRetry(chainId);
    const contract = new ethers.Contract(tokenAddress, ['function getReserves() view returns (uint112, uint112, uint32)'], provider);
    const [reserve0, reserve1] = await contract.getReserves();

    // Assuming WMATIC is reserve0 and WETH is reserve1 for simplicity
    // This logic might need to be more robust depending on the pair
    let price: number;
    if (tokenAddress.toLowerCase() === '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'.toLowerCase()) { // WMATIC
      price = Number(ethers.formatUnits(reserve1, 18)) / Number(ethers.formatUnits(reserve0, 18));
    } else { // Assume WETH or other token paired with WMATIC
      price = Number(ethers.formatUnits(reserve0, 18)) / Number(ethers.formatUnits(reserve1, 18));
    }

    this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
    return price;
  }

  async getUsdcPrice(chainId: number): Promise<number> {
    return this.getPrice(POLYGON_TOKENS.USDC, chainId);
  }

  async getUsdtPrice(chainId: number): Promise<number> {
    return this.getPrice(POLYGON_TOKENS.USDT, chainId);
  }

  async getWmaticPrice(chainId: number): Promise<number> {
    return this.getPrice(POLYGON_TOKENS.WMATIC, chainId);
  }

  async getWethPrice(chainId: number): Promise<number> {
    return this.getPrice(POLYGON_TOKENS.WETH, chainId);
  }

  /**
   * Получить балансы всех основных токенов для адреса
   */
  async getWalletBalances(address: string, chainId: number): Promise<{
    nativeBalance: string;
    nativeBalanceFormatted: string;
    tokens: Array<{ symbol: string; address: string; balance: string; balanceFormatted: string }>;
  }> {
    const provider = await this.getProviderWithRetry(chainId);

    // Получаем нативный баланс (MATIC/POL)
    const nativeBalance = await provider.getBalance(address);
    const nativeBalanceFormatted = ethers.formatEther(nativeBalance);

    // ERC20 ABI для balanceOf
    const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];

    // Токены для проверки
    const tokenList = chainId === 137 ? [
      { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
      { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
      { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
    ] : [
      { symbol: 'USDC', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6 },
      { symbol: 'WETH', address: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9', decimals: 18 },
      { symbol: 'POL', address: '0x0000000000000000000000000000000000001010', decimals: 18 },
    ];

    const tokens = [];

    for (const token of tokenList) {
      try {
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);
        const balanceFormatted = ethers.formatUnits(balance, token.decimals);

        tokens.push({
          symbol: token.symbol,
          address: token.address,
          balance: balance.toString(),
          balanceFormatted,
        });
      } catch (error) {
        console.error(`Error fetching balance for ${token.symbol}:`, error);
        tokens.push({
          symbol: token.symbol,
          address: token.address,
          balance: '0',
          balanceFormatted: '0.0',
        });
      }
    }

    return {
      nativeBalance: nativeBalance.toString(),
      nativeBalanceFormatted,
      tokens,
    };
  }

  async getNativeBalance(address: string, chainId: number): Promise<{
    balance: string;
    balanceFormatted: string;
  }> {
    const provider = await this.getProviderWithRetry(chainId);
    const balance = await provider.getBalance(address);
    return {
      balance: balance.toString(),
      balanceFormatted: ethers.formatEther(balance),
    };
  }

  async getGasPrice(chainId?: number): Promise<{
    gasPrice: string;
    gasPriceGwei: string;
  }> {
    const targetChainId = chainId || 137; // Default to Polygon Mainnet
    const provider = await this.getProviderWithRetry(targetChainId);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;
    return {
      gasPrice: gasPrice.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
    };
  }

  async getBlockNumber(chainId: number): Promise<number> {
    const provider = await this.getProviderWithRetry(chainId);
    return await provider.getBlockNumber();
  }

  async getTransaction(txHash: string, chainId: number): Promise<any> {
    const provider = await this.getProviderWithRetry(chainId);
    return await provider.getTransaction(txHash);
  }
}

export const POLYGON_TOKENS = {
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
};

export const web3Provider = new Web3Provider();

// Mock objects for demonstration purposes if running without actual RPC
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  // Mock ethers.JsonRpcProvider for testing
  (global as any).ethers = {
    ...ethers,
    JsonRpcProvider: class MockJsonRpcProvider {
      constructor(url: string, chainId: number | string | { name: string; chainId: number }, options?: any) {
        console.log(`MockJsonRpcProvider created for ${url} with chainId ${chainId}`);
        this.url = url;
        this.chainId = typeof chainId === 'object' ? chainId.chainId : chainId;
      }
      url: string;
      chainId: number;
      async getNetwork() { return { chainId: this.chainId, name: this.chainId === 137 ? 'Polygon' : 'Polygon Amoy' }; }
      async getBlockNumber() { return 12345; }
      async getBalance(address: string) { return ethers.parseEther('1.0'); }
      async call(transaction: any) { return '0x'; }
      async estimateGas(transaction: any) { return 21000n; }
      async sendTransaction(signedTx: string) { return { hash: '0x', ...ethers.Transaction.from(signedTx) }; }
      async getTransactionReceipt(hash: string) { return { status: 1, hash, blockNumber: 12345 } as any; }
      async getTransaction(hash: string) { return { hash, blockNumber: 12345 } as any; }
      async getFeeData() { return { gasPrice: ethers.parseUnits('30', 'gwei'), maxFeePerGas: ethers.parseUnits('30', 'gwei'), maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei') }; }
      on(event: string, listener: (...args: any[]) => void) { console.log(`Mock provider listening on ${event}`); }
      off(event: string, listener: (...args: any[]) => void) { console.log(`Mock provider stopped listening on ${event}`); }
      getContract(address: string, abi: any[]) {
        return {
          getReserves: async () => [ethers.parseUnits('1000', 18), ethers.parseUnits('1', 18)], // Mock reserves for price calculation
        };
      }
    },
    Network: {
      from: (chainId: number) => ({ chainId: chainId, name: chainId === 137 ? 'Polygon' : 'Polygon Amoy' })
    },
    Transaction: {
      from: (signedTx: string) => ({ to: '0xMock', value: ethers.parseEther('0.1') })
    },
    parseUnits: (value: string, decimals: number) => ethers.parseUnits(value, decimals),
    formatUnits: (value: string | bigint, decimals: number) => ethers.formatUnits(value, decimals),
    parseEther: (ether: string) => ethers.parseEther(ether)
  };
  // Mock configLoader
  (global as any).configLoader = {
    getConfig: () => ({
      networkMode: 'mainnet',
      polygonTestnetRpcUrl: '',
      polygonRpcUrl: '',
    }),
  };
}
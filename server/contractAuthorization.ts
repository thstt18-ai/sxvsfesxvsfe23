import { ethers } from 'ethers';
import { storage } from './storage';
import { web3Provider } from './web3Provider';

const ARBITRAGE_EXECUTOR_ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function addExecutor(address executor) external',
  'function removeExecutor(address executor) external',
  'function approvedExecutors(address) external view returns (bool)',
  'function EXECUTOR_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)'
];

interface AuthorizationResult {
  success: boolean;
  message: string;
  txHash?: string;
  error?: string;
}

async function getWalletInfo() {
  const config = await storage.getBotConfig('demo-user-1');
  if (!config?.privateKey) {
    throw new Error('Private key не настроен в конфигурации');
  }
  
  const rpcUrl = config.networkMode === 'mainnet' 
    ? config.polygonRpcUrl 
    : config.polygonTestnetRpcUrl;
    
  if (!rpcUrl) {
    throw new Error('RPC URL не настроен');
  }
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  return {
    address: wallet.address,
    provider,
    wallet
  };
}

export async function authorizeExecutor(executorAddress: string): Promise<AuthorizationResult> {
  try {
    const config = await storage.getBotConfig('demo-user-1');

    if (!config.privateKey) {
      return {
        success: false,
        message: 'Private key не настроен',
        error: 'PRIVATE_KEY_MISSING'
      };
    }

    if (!config.flashLoanContract) {
      return {
        success: false,
        message: 'Адрес контракта ArbitrageExecutor не настроен',
        error: 'CONTRACT_ADDRESS_MISSING'
      };
    }

    // Подключение к сети с fallback RPC
    const mainRpcUrl = config.networkMode === 'mainnet' 
      ? config.polygonRpcUrl 
      : config.polygonTestnetRpcUrl;

    const fallbackRpcs = config.networkMode === 'mainnet'
      ? ['https://polygon-rpc.com', 'https://rpc-mainnet.matic.network', 'https://polygon.llamarpc.com']
      : ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy.blockpi.network/v1/rpc/public'];

    let provider: ethers.JsonRpcProvider | undefined;
    let signer: ethers.Wallet | undefined;

    // Пробуем подключиться через разные RPC
    for (const rpc of [mainRpcUrl, ...fallbackRpcs]) {
      try {
        const testProvider = new ethers.JsonRpcProvider(rpc);
        await testProvider.ready;
        provider = testProvider;
        signer = new ethers.Wallet(config.privateKey, provider);
        console.log(`✅ Авторизация через RPC: ${rpc}`);
        break;
      } catch (e) {
        console.error(`❌ RPC ${rpc} failed for authorization`);
        continue;
      }
    }

    if (!provider || !signer) {
      return {
        success: false,
        message: 'Не удалось подключиться ни к одному RPC',
        error: 'ALL_RPC_FAILED'
      };
    }

    // Проверка баланса
    const balance = await provider.getBalance(signer.address);
    if (balance < ethers.parseEther('0.01')) {
      return {
        success: false,
        message: `Недостаточно ${config.networkMode === 'mainnet' ? 'MATIC' : 'tMATIC'} для оплаты газа (минимум 0.01)`,
        error: 'INSUFFICIENT_BALANCE'
      };
    }

    const contract = new ethers.Contract(config.flashLoanContract, ARBITRAGE_EXECUTOR_ABI, signer);

    // Проверяем DEFAULT_ADMIN_ROLE
    const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();
    const isAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
    
    if (!isAdmin) {
      return {
        success: false,
        message: `Вы не администратор контракта`,
        error: 'NOT_ADMIN'
      };
    }

    // Проверяем, авторизован ли уже
    const isApproved = await contract.approvedExecutors(executorAddress);

    if (isApproved) {
      return {
        success: true,
        message: 'Executor уже авторизован'
      };
    }

    // Авторизуем executor
    const tx = await contract.addExecutor(executorAddress, {
      gasLimit: 150000
    });

    await tx.wait();

    // Проверяем результат
    let isNowApproved = false;
    try {
      isNowApproved = await contract.approvedExecutors(executorAddress);
    } catch {
      try {
        isNowApproved = await contract.authorizedExecutors(executorAddress);
      } catch (e) {
        console.error('Error checking authorization after tx:', e);
      }
    }

    if (isNowApproved) {
      return {
        success: true,
        message: 'Executor успешно авторизован',
        txHash: tx.hash
      };
    } else {
      return {
        success: false,
        message: 'Транзакция выполнена, но статус не изменился',
        error: 'AUTHORIZATION_FAILED',
        txHash: tx.hash
      };
    }
  } catch (error: any) {
    console.error('Authorization error:', error);
    return {
      success: false,
      message: error.message || 'Ошибка авторизации',
      error: 'UNKNOWN_ERROR'
    };
  }
}

export async function checkExecutorStatus(
  contractAddress: string,
  executorAddress: string,
  chainId: number
): Promise<{
  isAuthorized: boolean;
  isOwner: boolean;
  ownerAddress?: string;
  error?: string;
}> {
  try {
    // Validate it's not Aave Pool address
    const AAVE_POOL_MAINNET = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
    const AAVE_POOL_TESTNET = '0x6C9fB0D5bD9429eb9Cd96B85B81d872281771E6B';
    
    if (contractAddress.toLowerCase() === AAVE_POOL_MAINNET.toLowerCase() ||
        contractAddress.toLowerCase() === AAVE_POOL_TESTNET.toLowerCase()) {
      return {
        isAuthorized: false,
        isOwner: false,
        error: `WRONG_CONTRACT_ADDRESS: Адрес ${contractAddress} - это Aave Pool контракт!\n\n` +
               `⚠️ КРИТИЧЕСКАЯ ОШИБКА: Вы указали адрес Aave Pool вместо ArbitrageExecutor!\n\n` +
               `Для исправления:\n` +
               `1. Разверните свой контракт: cd contracts && npm run deploy:${chainId === 137 ? 'polygon' : 'amoy'}\n` +
               `2. Скопируйте адрес НОВОГО контракта из консоли\n` +
               `3. Добавьте его в Settings → Flash Loan Contract Address\n` +
               `4. Удалите старый адрес ${contractAddress}`
      };
    }

    const config = await storage.getBotConfig('demo-user-1');

    let rpcUrl = chainId === 137 
      ? config?.polygonRpcUrl 
      : config?.polygonTestnetRpcUrl;

    // Fallback to default public RPCs
    if (!rpcUrl || rpcUrl.includes('undefined') || rpcUrl.includes('YOUR_KEY')) {
      rpcUrl = chainId === 137 
        ? 'https://polygon-rpc.com'
        : 'https://rpc-amoy.polygon.technology';
      console.log(`Using default RPC for chainId ${chainId}: ${rpcUrl}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
      staticNetwork: true
    });

    // Wait for provider to be ready
    await provider.ready;

    // Retry механизм с fallback RPC
    const fallbackRpcs = chainId === 137 
      ? ['https://polygon-rpc.com', 'https://rpc-mainnet.matic.network', 'https://polygon.llamarpc.com']
      : ['https://rpc-amoy.polygon.technology', 'https://polygon-amoy.blockpi.network/v1/rpc/public'];

    let contract: ethers.Contract | undefined;
    let workingProvider: ethers.JsonRpcProvider | undefined;

    // Пробуем разные RPC до успеха
    for (const rpc of [rpcUrl, ...fallbackRpcs]) {
      try {
        console.log(`🔄 Попытка подключения к RPC: ${rpc}`);
        const testProvider = new ethers.JsonRpcProvider(rpc, chainId, { 
          staticNetwork: true,
          batchMaxCount: 1
        });
        
        // Даем больше времени на подключение
        await Promise.race([
          testProvider.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Provider ready timeout')), 10000))
        ]);

        // Проверяем, что контракт существует
        const code = await Promise.race([
          testProvider.getCode(contractAddress),
          new Promise((_, reject) => setTimeout(() => reject(new Error('GetCode timeout')), 10000))
        ]) as string;

        if (code === '0x' || code === '0x0') {
          console.log(`⚠️ Контракт не найден по адресу ${contractAddress} на RPC ${rpc}`);
          continue; // Пробуем следующий RPC
        }

        workingProvider = testProvider;
        contract = new ethers.Contract(contractAddress, ARBITRAGE_EXECUTOR_ABI, testProvider);
        console.log(`✅ Успешное подключение через RPC: ${rpc}`);
        break;
      } catch (e: any) {
        console.error(`❌ RPC ${rpc} failed:`, e.message);
        continue;
      }
    }

    if (!contract || !workingProvider) {
      const networkName = chainId === 137 ? 'Polygon Mainnet' : 'Polygon Amoy Testnet';
      const deployCommand = chainId === 137 ? 'deploy:polygon' : 'deploy:amoy';
      return { 
        isAuthorized: false,
        isOwner: false,
        error: `CONTRACT_NOT_DEPLOYED: Контракт ${contractAddress} не найден в сети ${networkName}.\n\n` +
               `⚠️ ВНИМАНИЕ: Адрес 0x794a61358D6845594F94dc1DB02A252b5b4814aD - это Aave Pool, а не ArbitrageExecutor!\n\n` +
               `Для развертывания контракта:\n` +
               `1. cd contracts\n` +
               `2. npm run ${deployCommand}\n` +
               `3. Скопируйте адрес нового контракта в Settings → Flash Loan Contract Address\n\n` +
               `Используемые RPC: ${[rpcUrl, ...fallbackRpcs].join(', ')}`
      };
    }

    // Пробуем вызвать функции с обработкой ошибок
    let isAuthorized = false;
    let ownerAddress: string | undefined;

    try {
      ownerAddress = await Promise.race([
        contract.owner(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Owner call timeout')), 15000))
      ]) as string;
      console.log(`✅ Owner контракта: ${ownerAddress}`);
    } catch (e: any) {
      console.error('Error getting owner:', e.message);
      const networkName = chainId === 137 ? 'Polygon Mainnet' : 'Polygon Amoy Testnet';
      return { 
        isAuthorized: false, 
        isOwner: false, 
        error: `CONTRACT_OWNER_ERROR: Не удалось получить owner контракта на ${networkName}.\n\n` +
               `Возможные причины:\n` +
               `1. Контракт не полностью развернут или не прошел проверку\n` +
               `2. RPC endpoints перегружены или недоступны\n` +
               `3. Неправильный адрес контракта: ${contractAddress}\n\n` +
               `Рекомендации:\n` +
               `- Проверьте статус развертывания контракта\n` +
               `- Используйте другие RPC endpoints\n` +
               `- Убедитесь, что контракт развернут командой: cd contracts && npx hardhat run scripts/deploy.ts --network ${chainId === 137 ? 'polygon' : 'amoy'}`
      };
    }

    // Проверяем, является ли executor owner'ом
    const isOwner = ownerAddress.toLowerCase() === executorAddress.toLowerCase();

    // Пробуем оба метода проверки авторизации
    try {
      isAuthorized = await contract.approvedExecutors(executorAddress);
    } catch {
      try {
        isAuthorized = await contract.authorizedExecutors(executorAddress);
      } catch (e) {
        console.error('Error checking authorization:', e);
      }
    }

    return {
      isAuthorized,
      isOwner,
      ownerAddress
    };

  } catch (error: any) {
    console.error('Check status error:', error);
    return {
      isAuthorized: false,
      isOwner: false,
      error: `NETWORK_ERROR: ${error.message}`
    };
  }
}
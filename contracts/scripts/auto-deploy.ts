
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Автоматическое развертывание ArbitrageExecutor\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceInMatic = ethers.formatEther(balance);
  console.log("💰 Deployer balance:", balanceInMatic, "MATIC\n");

  // Проверка минимального баланса
  const minBalance = ethers.parseEther("0.1");
  if (balance < minBalance) {
    throw new Error(
      `❌ Недостаточно средств для развертывания. Минимум 0.1 MATIC.\n` +
      `Текущий баланс: ${balanceInMatic} MATIC\n` +
      `Пополните кошелек: ${deployer.address}`
    );
  }

  // Определение сети
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  let poolAddressProvider: string;
  let networkName: string;
  
  if (chainId === 137) {
    poolAddressProvider = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
    networkName = "Polygon Mainnet";
  } else if (chainId === 80002) {
    poolAddressProvider = "0x0496275d34753A48320CA58103d5220d394FF77F";
    networkName = "Polygon Amoy Testnet";
  } else {
    throw new Error(`❌ Неподдерживаемая сеть: ${chainId}`);
  }

  console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);
  console.log(`📋 Aave Pool Provider: ${poolAddressProvider}\n`);

  // Развертывание контракта
  console.log("📝 Компиляция контракта...");
  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  
  console.log("🚀 Развертывание контракта...");
  const arbitrageExecutor = await ArbitrageExecutor.deploy(poolAddressProvider);

  console.log("⏳ Ожидание подтверждения...");
  await arbitrageExecutor.waitForDeployment();
  
  const contractAddress = await arbitrageExecutor.getAddress();
  console.log(`\n✅ ArbitrageExecutor развернут: ${contractAddress}\n`);

  // Автоматическая авторизация deployer как executor
  console.log("🔐 Авторизация deployer как executor...");
  try {
    const owner = await arbitrageExecutor.owner();
    console.log(`👑 Owner контракта: ${owner}`);
    
    if (owner.toLowerCase() === deployer.address.toLowerCase()) {
      const isAlreadyAuthorized = await arbitrageExecutor.authorizedExecutors(deployer.address);
      
      if (!isAlreadyAuthorized) {
        const authTx = await arbitrageExecutor.authorizeExecutor(deployer.address, true);
        await authTx.wait();
        console.log("✅ Deployer авторизован как executor");
      } else {
        console.log("✅ Deployer уже авторизован");
      }
    }
  } catch (error: any) {
    console.warn("⚠️ Не удалось автоматически авторизовать executor:", error.message);
  }

  // Сохранение информации о развертывании
  const deploymentInfo = {
    network: networkName,
    chainId,
    contractAddress,
    poolAddressProvider,
    deployerAddress: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deployments: any = {};
  
  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  
  deployments[chainId] = deploymentInfo;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log(`\n📄 Информация о развертывании сохранена в deployments.json\n`);

  // Сохранение адреса контракта в .env
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
    if (envContent.includes("ARBITRAGE_EXECUTOR_ADDRESS=")) {
      envContent = envContent.replace(
        /ARBITRAGE_EXECUTOR_ADDRESS=.*/,
        `ARBITRAGE_EXECUTOR_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `\nARBITRAGE_EXECUTOR_ADDRESS=${contractAddress}\n`;
    }
  } else {
    envContent = `ARBITRAGE_EXECUTOR_ADDRESS=${contractAddress}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Адрес контракта сохранен в .env\n`);

  // Сохранение в корневом .env для backend
  const rootEnvPath = path.join(__dirname, "..", "..", ".env");
  let rootEnvContent = "";
  
  if (fs.existsSync(rootEnvPath)) {
    rootEnvContent = fs.readFileSync(rootEnvPath, "utf8");
    if (rootEnvContent.includes("ARBITRAGE_CONTRACT=")) {
      rootEnvContent = rootEnvContent.replace(
        /ARBITRAGE_CONTRACT=.*/,
        `ARBITRAGE_CONTRACT=${contractAddress}`
      );
    } else {
      rootEnvContent += `\nARBITRAGE_CONTRACT=${contractAddress}\n`;
    }
  } else {
    rootEnvContent = `ARBITRAGE_CONTRACT=${contractAddress}\n`;
  }
  
  fs.writeFileSync(rootEnvPath, rootEnvContent);
  console.log(`✅ Адрес контракта сохранен в корневом .env\n`);

  // Инструкции для следующих шагов
  console.log("📋 СЛЕДУЮЩИЕ ШАГИ:\n");
  console.log("1️⃣ Добавьте адрес контракта в настройки приложения:");
  console.log(`   Settings → Network → Flash Loan Contract Address`);
  console.log(`   ${contractAddress}\n`);
  
  console.log("2️⃣ Или добавьте в Secrets (рекомендуется):");
  console.log(`   Tools → Secrets → ARBITRAGE_CONTRACT → ${contractAddress}\n`);
  
  console.log("3️⃣ Авторизуйте дополнительных executors (опционально):");
  console.log(`   cd contracts && npx tsx scripts/authorize-executor.ts ${contractAddress} <EXECUTOR_ADDRESS>\n`);
  
  console.log("4️⃣ Верифицируйте контракт на PolygonScan (опционально):");
  console.log(`   npx hardhat verify --network ${chainId === 137 ? 'polygon' : 'amoy'} ${contractAddress} ${poolAddressProvider}\n`);

  console.log("✅ Автоматическое развертывание завершено!\n");
  
  return {
    contractAddress,
    network: networkName,
    chainId,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ ОШИБКА РАЗВЕРТЫВАНИЯ:\n", error);
    process.exit(1);
  });

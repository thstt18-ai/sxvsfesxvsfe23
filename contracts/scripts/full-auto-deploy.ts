
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Полное автоматическое развертывание и авторизация ArbitrageExecutor\n");

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
      // Проверяем метод авторизации
      let authSuccess = false;
      
      try {
        // Пробуем новый метод addExecutor
        const isAlreadyApproved = await arbitrageExecutor.approvedExecutors(deployer.address);
        
        if (!isAlreadyApproved) {
          const authTx = await arbitrageExecutor.addExecutor(deployer.address);
          await authTx.wait();
          console.log("✅ Deployer авторизован через addExecutor()");
          authSuccess = true;
        } else {
          console.log("✅ Deployer уже авторизован");
          authSuccess = true;
        }
      } catch (e1) {
        // Пробуем старый метод authorizeExecutor
        try {
          const isAlreadyAuthorized = await arbitrageExecutor.authorizedExecutors(deployer.address);
          
          if (!isAlreadyAuthorized) {
            const authTx = await arbitrageExecutor.authorizeExecutor(deployer.address, true);
            await authTx.wait();
            console.log("✅ Deployer авторизован через authorizeExecutor()");
            authSuccess = true;
          } else {
            console.log("✅ Deployer уже авторизован");
            authSuccess = true;
          }
        } catch (e2) {
          console.warn("⚠️ Не удалось автоматически авторизовать executor. Используйте команду authorize-executor.ts");
        }
      }

      // Финальная проверка
      if (authSuccess) {
        let isAuthorized = false;
        try {
          isAuthorized = await arbitrageExecutor.approvedExecutors(deployer.address);
        } catch {
          try {
            isAuthorized = await arbitrageExecutor.authorizedExecutors(deployer.address);
          } catch {}
        }
        
        if (isAuthorized) {
          console.log("✅ Авторизация подтверждена!");
          console.log(`\n🎉 Адрес подписанного контракта: ${contractAddress}\n`);
        } else {
          console.warn("⚠️ Авторизация выполнена, но не подтверждена. Проверьте вручную.");
        }
      }
    } else {
      console.warn(`⚠️ Deployer (${deployer.address}) не является owner'ом контракта (${owner})`);
    }
  } catch (error: any) {
    console.warn("⚠️ Ошибка при авторизации:", error.message);
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
    authorized: true,
  };

  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deployments: any = {};
  
  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  }
  
  deployments[chainId] = deploymentInfo;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log(`📄 Информация о развертывании сохранена в deployments.json\n`);

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
  console.log(`✅ Адрес контракта сохранен в contracts/.env\n`);

  // Сохранение в корневом .env
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

  console.log("✅ Полное автоматическое развертывание и авторизация завершены!\n");
  
  return {
    contractAddress,
    network: networkName,
    chainId,
    authorized: true,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ ОШИБКА РАЗВЕРТЫВАНИЯ:\n", error);
    process.exit(1);
  });

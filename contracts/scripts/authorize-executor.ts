
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

// Загружаем переменные окружения из корневого .env
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function main() {
  const contractAddress = process.argv[2] || process.env.ARBITRAGE_CONTRACT;
  
  if (!contractAddress) {
    throw new Error("Contract address required. Usage: npx tsx scripts/authorize-executor.ts <CONTRACT_ADDRESS>");
  }

  console.log(`🔐 Авторизация executor для контракта: ${contractAddress}`);

  // Проверяем наличие Private Key
  if (!process.env.PRIVATE_KEY) {
    throw new Error("❌ PRIVATE_KEY не найден в переменных окружения");
  }

  // Получаем информацию о сети
  const network = await ethers.provider.getNetwork();
  console.log(`🌐 Сеть: ${network.name} (Chain ID: ${network.chainId})`);

  const [deployer] = await ethers.getSigners();
  console.log(`📍 Deployer: ${deployer.address}`);

  // Проверяем баланс с повторными попытками
  let balance;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (attempts < maxAttempts) {
    try {
      balance = await ethers.provider.getBalance(deployer.address);
      console.log(`💰 Баланс: ${ethers.formatEther(balance)} MATIC`);
      break;
    } catch (error: any) {
      attempts++;
      console.log(`⚠️ Попытка ${attempts}/${maxAttempts} получить баланс не удалась, повтор через 2 секунды...`);
      if (attempts >= maxAttempts) {
        throw new Error(`Не удалось получить баланс после ${maxAttempts} попыток: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (balance && balance < ethers.parseEther("0.01")) {
    console.warn("⚠️ Низкий баланс! Рекомендуется иметь минимум 0.01 MATIC для транзакций");
  }

  // Подключаемся к контракту
  console.log("🔗 Подключение к контракту...");
  const ArbitrageExecutor = await ethers.getContractAt("ArbitrageExecutor", contractAddress);

  // Проверяем что контракт существует
  const code = await ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    throw new Error(`❌ Контракт не найден по адресу ${contractAddress}`);
  }
  console.log("✅ Контракт найден");

  // Проверяем текущий статус авторизации
  console.log("🔍 Проверка текущего статуса авторизации...");
  const isAuthorized = await ArbitrageExecutor.authorizedExecutors(deployer.address);
  
  if (isAuthorized) {
    console.log("✅ Deployer уже авторизован");
    console.log(`📋 Адрес авторизованного контракта: ${contractAddress}`);
    return contractAddress;
  }

  console.log("🔄 Отправка транзакции авторизации...");
  
  // Получаем текущую цену газа
  const feeData = await ethers.provider.getFeeData();
  console.log(`⛽ Текущая цена газа: ${ethers.formatUnits(feeData.gasPrice || 0n, "gwei")} Gwei`);
  
  // Авторизуем deployer
  const tx = await ArbitrageExecutor.authorizeExecutor(deployer.address, true, {
    gasLimit: 150000,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
  });
  
  console.log(`📤 Транзакция отправлена: ${tx.hash}`);
  console.log("⏳ Ожидание подтверждения...");
  
  const receipt = await tx.wait(2); // Ждем 2 подтверждения для надежности
  
  console.log(`✅ Транзакция подтверждена в блоке: ${receipt?.blockNumber}`);
  console.log(`✅ Deployer авторизован: ${deployer.address}`);
  console.log(`📋 TX Hash: ${tx.hash}`);
  console.log(`⛽ Gas использовано: ${receipt?.gasUsed.toString()}`);
  
  // Финальная проверка
  const finalCheck = await ArbitrageExecutor.authorizedExecutors(deployer.address);
  console.log(`🔍 Финальная проверка: ${finalCheck ? "✅ Авторизован" : "❌ Не авторизован"}`);
  
  if (!finalCheck) {
    throw new Error("❌ Авторизация не прошла проверку");
  }
  
  console.log(`\n📋 Адрес подписанного контракта: ${contractAddress}`);
  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Ошибка авторизации:", error.message);
    if (error.reason) console.error("Причина:", error.reason);
    if (error.code) console.error("Код ошибки:", error.code);
    process.exit(1);
  });

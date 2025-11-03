
import { ethers } from "ethers";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

/**
 * Автоматическая настройка тестнета:
 * - Переключение на Amoy
 * - Запрос тестовых токенов через faucet
 * - Включение mock-режима при низкой ликвидности
 */

const AMOY_RPC = "https://rpc-amoy.polygon.technology";
const FAUCET_API = "https://faucet.polygon.technology/api/v1/request";

async function setupTestnet() {
  console.log("🔧 Автоматическая настройка тестнета Amoy...\n");

  try {
    // 1. Проверка подключения к RPC
    console.log("📡 Проверка подключения к RPC...");
    const provider = new ethers.JsonRpcProvider(AMOY_RPC);
    const network = await provider.getNetwork();
    console.log(`✅ Подключено к сети: Chain ID ${network.chainId}\n`);

    // 2. Загрузка приватного ключа
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      throw new Error("❌ Файл .env не найден");
    }

    const envContent = fs.readFileSync(envPath, "utf-8");
    const privateKeyMatch = envContent.match(/PRIVATE_KEY=(.+)/);
    
    if (!privateKeyMatch) {
      throw new Error("❌ PRIVATE_KEY не найден в .env");
    }

    const wallet = new ethers.Wallet(privateKeyMatch[1], provider);
    console.log(`👤 Адрес кошелька: ${wallet.address}`);

    // 3. Проверка баланса
    const balance = await provider.getBalance(wallet.address);
    const balanceInMatic = ethers.formatEther(balance);
    console.log(`💰 Текущий баланс: ${balanceInMatic} MATIC\n`);

    // 4. Запрос тестовых токенов если баланс низкий
    if (parseFloat(balanceInMatic) < 0.1) {
      console.log("🚰 Запрос тестовых токенов через faucet...");
      try {
        const response = await axios.post(FAUCET_API, {
          network: "amoy",
          address: wallet.address,
        }, {
          timeout: 10000,
        });
        
        if (response.data.success) {
          console.log("✅ Тестовые токены запрошены успешно");
          console.log("⏳ Ожидание поступления токенов (30 сек)...");
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      } catch (error: any) {
        console.log("⚠️ Faucet недоступен, используйте ручной запрос:");
        console.log(`   https://faucet.polygon.technology/`);
      }
    }

    // 5. Включение mock-режима в конфигурации
    console.log("\n🎭 Включение mock-режима для тестнета...");
    const configUpdate = `
# Testnet Configuration (Auto-generated)
NETWORK=amoy
USE_MOCK_DATA=true
LOW_LIQUIDITY_MODE=true
TENDERLY_SIMULATION=true
MIN_PROFIT_THRESHOLD=0.001
`;

    if (!envContent.includes("USE_MOCK_DATA")) {
      fs.appendFileSync(envPath, configUpdate);
      console.log("✅ Mock-режим включен в .env");
    }

    // 6. Проверка развертывания контракта
    console.log("\n📋 Проверка контракта...");
    const contractMatch = envContent.match(/ARBITRAGE_EXECUTOR_ADDRESS=(.+)/);
    
    if (!contractMatch || contractMatch[1] === "0x") {
      console.log("⚠️ Контракт не развернут");
      console.log("💡 Запустите: npm run auto-deploy:amoy");
    } else {
      console.log(`✅ Контракт развернут: ${contractMatch[1]}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ НАСТРОЙКА ТЕСТНЕТА ЗАВЕРШЕНА");
    console.log("=".repeat(60));
    console.log("\n📋 Следующие шаги:");
    console.log("1. Проверьте баланс: npm run balance");
    console.log("2. Разверните контракт: npm run auto-deploy:amoy");
    console.log("3. Запустите бота: npm run dev");

  } catch (error: any) {
    console.error("\n❌ Ошибка настройки:", error.message);
    process.exit(1);
  }
}

setupTestnet();

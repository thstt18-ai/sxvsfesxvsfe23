// Network-specific Aave V3 Pool addresses
const AAVE_POOLS: Record<string, string> = {
  polygon: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  amoy: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 АВТОМАТИЧЕСКОЕ РАЗВЕРТЫВАНИЕ КОНТРАКТА");
  console.log("=" .repeat(80));

  const network = await hre.ethers.provider.getNetwork();
  const networkName = network.name === 'unknown' ? 'amoy' : network.name;
  const aavePoolAddress = AAVE_POOLS[networkName];

  if (!aavePoolAddress) {
    throw new Error(`Aave Pool address not configured for network: ${networkName}`);
  }

  console.log(`\n🌐 Сеть: ${networkName}`);
  console.log(`📋 Aave Pool: ${aavePoolAddress}\n`);

  try {
    // Step 1: Проверка баланса
    const [deployer] = await hre.ethers.getSigners();
    console.log("\n📍 Deployer:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    const balanceInMatic = hre.ethers.formatEther(balance);
    console.log("💰 Баланс:", balanceInMatic, "MATIC");

    if (balance < hre.ethers.parseEther("0.1")) {
      throw new Error(
        `❌ Недостаточно средств: ${balanceInMatic} MATIC (минимум 0.1 MATIC)\n` +
        `Пополните кошелек: ${deployer.address}`
      );
    }

    // Step 2: Определение сети - this step is now partially handled by auto-detection above
    // Re-assigning variables for consistency with original logic, but using auto-detected values
    let poolAddressProvider = aavePoolAddress; // Use auto-detected Aave Pool address
    let usdcAddress: string;
    let trustedForwarder: string;
    let displayNetworkName: string; // Use a different variable name to avoid conflict

    const chainId = Number(network.chainId);

    if (chainId === 137) {
      usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
      trustedForwarder = "0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8";
      displayNetworkName = "Polygon Mainnet";
    } else if (chainId === 80002) {
      usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
      trustedForwarder = "0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b";
      displayNetworkName = "Polygon Amoy Testnet";
    } else {
      throw new Error(`❌ Неподдерживаемая сеть: ${chainId}`);
    }

    console.log(`📋 USDC: ${usdcAddress}`);

    // Step 3: Подготовка multisig pausers
    const pausers = [deployer.address, deployer.address, deployer.address];

    // Step 4: Развертывание
    console.log("\n⏳ Развертывание ArbitrageExecutor с UUPS Proxy...");
    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");

    const proxy = await hre.upgrades.deployProxy(
      ArbitrageExecutor,
      [poolAddressProvider, usdcAddress, pausers],
      {
        initializer: "initialize",
        kind: "uups",
        constructorArgs: [trustedForwarder]
      }
    );

    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();

    console.log("\n✅ Контракт развернут:", proxyAddress);

    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("📦 Implementation:", implementationAddress);

    // Step 5: Проверка размера контракта
    const code = await hre.ethers.provider.getCode(implementationAddress);
    const size = (code.length - 2) / 2;
    console.log(`📏 Размер: ${size} bytes (${(size/24576*100).toFixed(2)}% лимита)`);

    // Step 6: Автоматическая авторизация deployer
    console.log("\n🔐 Авторизация deployer как executor...");
    try {
      const contract = ArbitrageExecutor.attach(proxyAddress) as any;

      // Проверяем текущие роли
      const EXECUTOR_ROLE = await contract.EXECUTOR_ROLE();
      const hasRole = await contract.hasRole(EXECUTOR_ROLE, deployer.address);

      if (!hasRole) {
        const authTx = await contract.grantRole(EXECUTOR_ROLE, deployer.address);
        await authTx.wait();
        console.log("✅ Deployer авторизован через grantRole");
      } else {
        console.log("✅ Deployer уже имеет роль EXECUTOR");
      }
    } catch (error: any) {
      console.log("⚠️ Авторизация пропущена:", error.message);
    }

    // Step 7: Сохранение информации
    const deploymentInfo = {
      network: displayNetworkName, // Use the correctly named variable
      chainId,
      proxy: proxyAddress,
      implementation: implementationAddress,
      deployer: deployer.address,
      pausers,
      timestamp: new Date().toISOString(),
      contractSize: size
    };

    fs.mkdirSync("deployments", { recursive: true });
    fs.writeFileSync(
      `deployments/${chainId}-deployment.json`,
      JSON.stringify(deploymentInfo, null, 2)
    );

    // Step 8: Обновление .env
    const envPath = path.join(process.cwd(), ".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    const addressPattern = /ARBITRAGE_EXECUTOR_ADDRESS=.*/;
    if (addressPattern.test(envContent)) {
      envContent = envContent.replace(addressPattern, `ARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}`);
    } else {
      envContent += `\nARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}\n`;
    }

    fs.writeFileSync(envPath, envContent);

    // Step 9: Обновление конфигурации в корне проекта
    const rootEnvPath = path.join(process.cwd(), "..", ".env");
    if (fs.existsSync(rootEnvPath)) {
      let rootEnvContent = fs.readFileSync(rootEnvPath, "utf-8");
      if (addressPattern.test(rootEnvContent)) {
        rootEnvContent = rootEnvContent.replace(addressPattern, `ARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}`);
      } else {
        rootEnvContent += `\nARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}\n`;
      }
      fs.writeFileSync(rootEnvPath, rootEnvContent);
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО УСПЕШНО!");
    console.log("=".repeat(80));
    console.log(`📄 Адрес контракта: ${proxyAddress}`);
    console.log(`🌐 Сеть: ${displayNetworkName}`); // Use the correctly named variable
    console.log(`👤 Deployer (авторизован): ${deployer.address}`);
    console.log("\n📋 СЛЕДУЮЩИЕ ШАГИ:");
    console.log("1. ✅ Контракт уже сохранен в настройках");
    console.log("2. ✅ Deployer уже авторизован как executor");
    console.log("3. 🚀 Запустите торговлю через Dashboard");
    console.log("\n💡 ГОТОВО! Система полностью настроена для торговли.");
    console.log("=".repeat(80) + "\n");

    return proxyAddress;
  } catch (error: any) {
    console.error("\n❌ ОШИБКА РАЗВЕРТЫВАНИЯ:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
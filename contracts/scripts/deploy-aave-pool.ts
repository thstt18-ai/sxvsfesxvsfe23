import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Автоматическое развертывание контракта с Aave Pool
 * Использует адрес Aave V3 Pool: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
 */

const AAVE_POOL_ADDRESS = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

async function main() {
  console.log("🚀 РАЗВЕРТЫВАНИЕ С AAVE POOL");
  console.log("=" .repeat(80));
  console.log(`📋 Aave Pool Address: ${AAVE_POOL_ADDRESS}\n`);

  try {
    // Проверка баланса
    const [deployer] = await hre.ethers.getSigners();
    console.log("📍 Deployer:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    const balanceInMatic = hre.ethers.formatEther(balance);
    console.log("💰 Баланс:", balanceInMatic, "MATIC");

    const network = await hre.ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    const networkName = chainId === 137 ? 'Polygon Mainnet' : chainId === 80002 ? 'Polygon Amoy' : 'Unknown';
    console.log(`🌐 Сеть: ${networkName} (Chain ID: ${chainId})\n`);

    if (balance < hre.ethers.parseEther("0.05")) {
      console.log(`⚠️  Низкий баланс: ${balanceInMatic} MATIC`);
      console.log(`💡 Рекомендуем минимум 0.1 MATIC для деплоя`);
      console.log(`📌 Пополните кошелек: ${deployer.address}\n`);
    }

    // Адреса для текущей сети
    const usdcAddress = chainId === 137 
      ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // Polygon Mainnet
      : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582'; // Amoy Testnet

    const pausers = [deployer.address, deployer.address, deployer.address];

    console.log("📝 Параметры развертывания:");
    console.log(`   Aave Pool: ${AAVE_POOL_ADDRESS}`);
    console.log(`   USDC: ${usdcAddress}`);
    console.log(`   Pausers: ${pausers.length} адрес(ов)\n`);

    // Компиляция
    console.log("🔨 Компиляция контракта...");
    await hre.run("compile");
    console.log("✅ Контракт скомпилирован\n");

    // Развертывание
    console.log("⏳ Развертывание ArbitrageExecutor с UUPS Proxy...");
    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");

    const proxy = await hre.upgrades.deployProxy(
      ArbitrageExecutor,
      [AAVE_POOL_ADDRESS, usdcAddress, pausers],
      {
        initializer: "initialize",
        kind: "uups",
      }
    );

    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();

    console.log("\n✅ КОНТРАКТ УСПЕШНО РАЗВЕРНУТ!");
    console.log("=" .repeat(80));
    console.log(`📍 Proxy Address: ${proxyAddress}`);

    const implementationAddress = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log(`📦 Implementation: ${implementationAddress}`);

    // Проверка размера контракта
    const code = await hre.ethers.provider.getCode(implementationAddress);
    const size = (code.length - 2) / 2;
    const percentage = (size / 24576 * 100).toFixed(2);
    console.log(`📏 Размер контракта: ${size} bytes (${percentage}% лимита 24KB)`);

    if (size > 24576) {
      console.log("⚠️  ВНИМАНИЕ: Размер превышает лимит EIP-170!");
    } else {
      console.log(`✅ Размер в пределах нормы (${24576 - size} bytes запаса)`);
    }

    // Автоматическая авторизация deployer
    console.log("\n🔐 Авторизация deployer для торговли...");
    const tx = await proxy.authorizeTrader(deployer.address);
    await tx.wait();
    console.log("✅ Deployer авторизован");

    // Сохранение адресов
    const deploymentInfo = {
      network: networkName,
      chainId: chainId,
      proxyAddress: proxyAddress,
      implementationAddress: implementationAddress,
      aavePool: AAVE_POOL_ADDRESS,
      usdcAddress: usdcAddress,
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      contractSize: size,
      txHash: tx.hash
    };

    const deploymentPath = path.join(__dirname, `../deployments/${networkName.toLowerCase().replace(' ', '-')}.json`);
    fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    console.log(`\n💾 Информация сохранена: ${deploymentPath}`);
    
    console.log("\n" + "=" .repeat(80));
    console.log("🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО!");
    console.log("=" .repeat(80));
    console.log("\n📋 Скопируйте Proxy Address и добавьте в Settings → Flash Loan Contract:");
    console.log(`\n   ${proxyAddress}\n`);
    console.log("💡 Следующие шаги:");
    console.log("   1. Откройте приложение → Settings");
    console.log("   2. Вставьте адрес в поле 'Flash Loan Contract'");
    console.log("   3. Настройте Private Key и 1inch API Key");
    console.log("   4. Запустите бота!\n");

  } catch (error: any) {
    console.error("\n❌ ОШИБКА РАЗВЕРТЫВАНИЯ:");
    console.error(error.message);
    
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Решение: Пополните кошелек тестовыми MATIC");
      console.log("   Polygon Amoy Faucet: https://faucet.polygon.technology/");
    }
    
    if (error.message.includes("nonce")) {
      console.log("\n💡 Решение: Подождите несколько секунд и попробуйте снова");
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

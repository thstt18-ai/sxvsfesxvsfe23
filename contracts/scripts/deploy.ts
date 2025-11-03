import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("🚀 Deploying ArbitrageExecutor with UUPS Proxy...");

  const [deployer, pauser1, pauser2] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Pauser 1:", pauser1?.address || "Not available");
  console.log("Pauser 2:", pauser2?.address || "Not available");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "MATIC");

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  let poolAddressProvider: string;
  let usdcAddress: string;
  let trustedForwarder: string;

  if (chainId === 137) {
    poolAddressProvider = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
    usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    trustedForwarder = "0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8"; // Polygon Mainnet Biconomy
    console.log("Network: Polygon Mainnet");
  } else if (chainId === 80002) {
    poolAddressProvider = "0x0496275d34753A48320CA58103d5220d394FF77F";
    usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"; // Amoy USDC
    trustedForwarder = "0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b"; // Amoy Biconomy
    console.log("Network: Polygon Amoy Testnet");
  } else {
    throw new Error(`Unsupported network: ${chainId}`);
  }

  console.log("Aave Pool Address Provider:", poolAddressProvider);
  console.log("USDC Address:", usdcAddress);
  console.log("Trusted Forwarder (Biconomy):", trustedForwarder);

  // Setup multisig pausers (2-of-3)
  const pausers = [
    deployer.address,
    pauser1?.address || deployer.address,
    pauser2?.address || deployer.address
  ];

  console.log("Emergency Pausers (2-of-3 multisig):", pausers);

  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");

  console.log("⏳ Deploying with UUPS Proxy...");
  const proxy = await upgrades.deployProxy(
    ArbitrageExecutor,
    [poolAddressProvider, usdcAddress, pausers],
    {
      initializer: "initialize",
      kind: "uups",
      constructorArgs: [poolAddressProvider]
    }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("✅ ArbitrageExecutor Proxy deployed to:", proxyAddress);

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("📦 Implementation address:", implementationAddress);

  // Check contract size
  const code = await ethers.provider.getCode(implementationAddress);
  const size = (code.length - 2) / 2; // Remove 0x and convert hex to bytes
  console.log(`📏 Contract size: ${size} bytes (${(size/24576*100).toFixed(2)}% of 24KB limit)`);

  if (size > 24576) {
    console.warn("⚠️ WARNING: Contract exceeds 24KB SpuriousDragon limit!");
  }

  console.log("\n📋 Next steps:");
  console.log("1. Add proxy address to Secrets:");
  console.log(`   ARBITRAGE_CONTRACT=${proxyAddress}`);
  console.log("\n2. Authorize executor wallets:");
  console.log(`   Contract automatically grants EXECUTOR_ROLE to admin`);
  console.log("\n3. Verify contract:");
  console.log(`   npx hardhat verify --network ${chainId === 137 ? 'polygon' : 'amoy'} ${proxyAddress}`);
  console.log("\n4. Submit to Sourcify:");
  console.log(`   npx hardhat sourcify --network ${chainId === 137 ? 'polygon' : 'amoy'}`);

  // Save deployment info
  const fs = require('fs');
  const path = require('path');
  
  const deploymentInfo = {
    network: chainId === 137 ? 'polygon' : 'amoy',
    chainId,
    proxy: proxyAddress,
    implementation: implementationAddress,
    deployer: deployer.address,
    pausers,
    timestamp: new Date().toISOString(),
    contractSize: size
  };

  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(
    `deployments/${chainId}-deployment.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Save to .env file
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }
  
  // Update or add ARBITRAGE_EXECUTOR_ADDRESS
  const addressPattern = /ARBITRAGE_EXECUTOR_ADDRESS=.*/;
  if (addressPattern.test(envContent)) {
    envContent = envContent.replace(addressPattern, `ARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}`);
  } else {
    envContent += `\nARBITRAGE_EXECUTOR_ADDRESS=${proxyAddress}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Contract address saved to .env: ${proxyAddress}`);

  const contractAddress = await proxy.getAddress();
  console.log('\n' + '='.repeat(80));
  console.log('✅ УСПЕШНОЕ РАЗВЕРТЫВАНИЕ КОНТРАКТА');
  console.log('='.repeat(80));
  console.log(`📄 Контракт ArbitrageExecutor: ${contractAddress}`);
  console.log(`🔗 TX Hash: ${proxy.deploymentTransaction()?.hash}`);
  console.log(`🌐 Сеть: ${network.name} (chainId: ${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log('\n📋 СЛЕДУЮЩИЕ ШАГИ:');
  console.log('1. Скопируйте адрес контракта выше');
  console.log('2. Откройте Settings → Flash Loan Contract Address');
  console.log('3. Вставьте адрес контракта');
  console.log('4. Авторизуйте свой кошелек командой:');
  console.log(`   npx tsx scripts/authorize-executor.ts ${contractAddress} <YOUR_WALLET_ADDRESS>`);
  console.log('='.repeat(80) + '\n');

  return proxyAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
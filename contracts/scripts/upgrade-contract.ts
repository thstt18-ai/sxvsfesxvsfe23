
import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log("⬆️  Upgrading ArbitrageExecutor...");
  console.log("Proxy Address:", proxyAddress);

  const ArbitrageExecutorV2 = await ethers.getContractFactory("ArbitrageExecutor");
  
  console.log("⏳ Upgrading contract...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, ArbitrageExecutorV2);
  await upgraded.waitForDeployment();

  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("✅ Contract upgraded successfully");
  console.log("New Implementation:", newImplementation);

  // Verify on explorer
  console.log("\n📝 To verify on PolygonScan:");
  console.log(`npx hardhat verify --network polygon ${newImplementation}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

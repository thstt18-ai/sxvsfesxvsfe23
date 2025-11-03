
import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log("🚨 Emergency Withdrawal");
  console.log("Proxy Address:", proxyAddress);
  console.log("Withdrawing to:", deployer.address);

  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  const contract = ArbitrageExecutor.attach(proxyAddress);

  // Withdraw all USDC
  console.log("⏳ Withdrawing USDC...");
  const tx = await contract.emergencyWithdraw(deployer.address);
  await tx.wait();
  
  console.log("✅ Emergency withdrawal complete");
  console.log("Transaction hash:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

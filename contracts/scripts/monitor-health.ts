
import { ethers } from "hardhat";

async function main() {
  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log("🏥 Contract Health Monitor");
  console.log("Proxy Address:", proxyAddress);
  console.log("================================");

  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  const contract = ArbitrageExecutor.attach(proxyAddress);

  try {
    // Check if paused
    const isPaused = await contract.paused();
    console.log("Status:", isPaused ? "⏸️  PAUSED" : "▶️  ACTIVE");

    // Check owner
    const owner = await contract.owner();
    console.log("Owner:", owner);

    // Check implementation
    const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("Implementation:", implementation);

    // Check balances
    const provider = ethers.provider;
    const maticBalance = await provider.getBalance(proxyAddress);
    console.log("MATIC Balance:", ethers.formatEther(maticBalance), "MATIC");

    const usdcAddress = process.env.USDC_ADDRESS || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
    const IERC20 = await ethers.getContractFactory("IERC20");
    const usdc = IERC20.attach(usdcAddress);
    const usdcBalance = await usdc.balanceOf(proxyAddress);
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");

    console.log("================================");
    console.log("✅ Health check complete");
  } catch (error) {
    console.error("❌ Health check failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

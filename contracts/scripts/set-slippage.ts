
import { ethers } from "hardhat";

async function main() {
  const newSlippage = process.argv[2];
  
  if (!newSlippage) {
    console.error("Usage: npx tsx scripts/set-slippage.ts <slippage_bps>");
    console.error("Example: npx tsx scripts/set-slippage.ts 50 (for 0.5%)");
    process.exit(1);
  }

  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log("🎚️  Setting Slippage Tolerance");
  console.log("Proxy Address:", proxyAddress);
  console.log("New Slippage:", newSlippage, "bps (", parseFloat(newSlippage) / 100, "%)");

  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  const contract = ArbitrageExecutor.attach(proxyAddress);

  const tx = await contract.setMaxSlippage(newSlippage);
  await tx.wait();
  
  console.log("✅ Slippage updated successfully");
  console.log("Transaction hash:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


import { ethers } from "hardhat";

async function main() {
  const action = process.argv[2]; // 'pause' or 'unpause'
  
  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log(`${action === 'pause' ? '⏸️ Pausing' : '▶️ Unpausing'} contract...`);
  console.log("Proxy Address:", proxyAddress);

  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  const contract = ArbitrageExecutor.attach(proxyAddress);

  if (action === 'pause') {
    const tx = await contract.pause();
    await tx.wait();
    console.log("✅ Contract paused");
  } else if (action === 'unpause') {
    const tx = await contract.unpause();
    await tx.wait();
    console.log("✅ Contract unpaused");
  } else {
    console.error("Usage: npx tsx scripts/pause-contract.ts [pause|unpause]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

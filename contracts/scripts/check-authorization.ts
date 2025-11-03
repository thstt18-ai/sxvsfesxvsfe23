
import { ethers } from "hardhat";

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/check-authorization.ts <CONTRACT_ADDRESS> <EXECUTOR_ADDRESS>");
    process.exit(1);
  }

  const contractAddress = args[0];
  const executorAddress = args[1];

  console.log("🔍 Checking authorization...");
  console.log("Contract:", contractAddress);
  console.log("Executor:", executorAddress);

  const ArbitrageExecutor = await ethers.getContractAt("ArbitrageExecutor", contractAddress);

  const isAuthorized = await ArbitrageExecutor.authorizedExecutors(executorAddress);
  const owner = await ArbitrageExecutor.owner();

  console.log("\n📊 Status:");
  console.log("Owner:", owner);
  console.log("Executor authorized:", isAuthorized);
  console.log("Is owner:", executorAddress.toLowerCase() === owner.toLowerCase());

  if (isAuthorized || executorAddress.toLowerCase() === owner.toLowerCase()) {
    console.log("\n✅ Executor is authorized to execute trades");
  } else {
    console.log("\n❌ Executor is NOT authorized");
    console.log("\nTo authorize, run:");
    console.log(`npx tsx scripts/authorize-executor.ts ${contractAddress} ${executorAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

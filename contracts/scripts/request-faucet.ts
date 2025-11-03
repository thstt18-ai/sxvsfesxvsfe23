
import { ethers } from "hardhat";
import fetch from "node-fetch";

async function main() {
  console.log("💧 Requesting testnet tokens from faucet...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Wallet address:", deployer.address);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 80002) {
    console.log("⚠️ Not on Amoy testnet. Skipping faucet request.");
    return;
  }

  // Check current balance
  const balanceBefore = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Current balance:", ethers.formatEther(balanceBefore), "MATIC\n");

  if (balanceBefore >= ethers.parseEther("1")) {
    console.log("✅ Sufficient balance. No faucet request needed.");
    return;
  }

  console.log("🌐 Faucet URLs:");
  console.log("   • https://faucet.polygon.technology/");
  console.log("   • https://www.alchemy.com/faucets/polygon-amoy");
  console.log("\n📋 Instructions:");
  console.log("   1. Visit one of the faucet URLs above");
  console.log("   2. Enter your wallet address:");
  console.log(`      ${deployer.address}`);
  console.log("   3. Request tokens (0.5-1 MATIC)");
  console.log("   4. Wait for transaction confirmation\n");

  console.log("⏳ Waiting for balance update (checking every 10 seconds)...");
  
  let attempts = 0;
  const maxAttempts = 30; // 5 minutes

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const balanceAfter = await ethers.provider.getBalance(deployer.address);
    
    if (balanceAfter > balanceBefore) {
      console.log(`\n✅ Tokens received!`);
      console.log(`   New balance: ${ethers.formatEther(balanceAfter)} MATIC`);
      console.log(`   Increase: +${ethers.formatEther(balanceAfter - balanceBefore)} MATIC\n`);
      return;
    }
    
    attempts++;
    process.stdout.write(".");
  }

  console.log("\n\n⚠️ Timeout waiting for tokens.");
  console.log("   Please manually request tokens from faucet and try again.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Faucet request failed:\n", error);
    process.exit(1);
  });

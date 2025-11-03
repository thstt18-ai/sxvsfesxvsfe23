
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

interface DeploymentConfig {
  network: "amoy" | "polygon";
  autoFaucet: boolean;
  enableMockMode: boolean;
  enableSimulation: boolean;
}

async function main() {
  console.log("🚀 One-Click Deployment & Setup Starting...\n");

  const config: DeploymentConfig = {
    network: process.env.DEPLOY_NETWORK === "polygon" ? "polygon" : "amoy",
    autoFaucet: true,
    enableMockMode: process.env.MOCK_MODE === "true",
    enableSimulation: process.env.ENABLE_SIMULATION !== "false",
  };

  console.log("📋 Configuration:");
  console.log(`   Network: ${config.network}`);
  console.log(`   Auto Faucet: ${config.autoFaucet}`);
  console.log(`   Mock Mode: ${config.enableMockMode}`);
  console.log(`   Simulation: ${config.enableSimulation}\n`);

  // Step 1: Install all dependencies
  console.log("📦 Step 1/6: Installing dependencies...");
  try {
    await execAsync("npm install --legacy-peer-deps");
    console.log("✅ Dependencies installed\n");
  } catch (error: any) {
    console.error("❌ Failed to install dependencies:", error.message);
    process.exit(1);
  }

  // Step 2: Request testnet tokens (if testnet)
  if (config.network === "amoy" && config.autoFaucet) {
    console.log("💧 Step 2/6: Requesting testnet tokens from faucet...");
    try {
      const { ethers } = await import("hardhat");
      const [deployer] = await ethers.getSigners();
      
      console.log(`   Wallet: ${deployer.address}`);
      console.log(`   Faucet: https://faucet.polygon.technology/`);
      console.log("   ⏳ Waiting 30 seconds for manual faucet request...");
      
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      const balance = await ethers.provider.getBalance(deployer.address);
      console.log(`   Balance: ${ethers.formatEther(balance)} MATIC\n`);
    } catch (error: any) {
      console.warn("⚠️ Faucet step skipped:", error.message, "\n");
    }
  } else {
    console.log("⏭️  Step 2/6: Skipped (mainnet or faucet disabled)\n");
  }

  // Step 3: Compile contracts
  console.log("🔨 Step 3/6: Compiling contracts...");
  try {
    await execAsync("npx hardhat compile");
    console.log("✅ Contracts compiled\n");
  } catch (error: any) {
    console.error("❌ Compilation failed:", error.message);
    process.exit(1);
  }

  // Step 4: Run size check
  console.log("📏 Step 4/6: Checking contract sizes...");
  try {
    const { stdout } = await execAsync("npm run size");
    console.log(stdout);
    console.log("✅ Size check passed\n");
  } catch (error: any) {
    console.warn("⚠️ Size check warning:", error.message, "\n");
  }

  // Step 5: Deploy contract
  console.log(`🚀 Step 5/6: Deploying to ${config.network}...`);
  try {
    await execAsync(`npx hardhat run scripts/deploy.ts --network ${config.network}`);
    console.log("✅ Contract deployed\n");
  } catch (error: any) {
    console.error("❌ Deployment failed:", error.message);
    process.exit(1);
  }

  // Step 6: Setup monitoring
  console.log("📊 Step 6/6: Setting up monitoring...");
  try {
    const deploymentPath = path.join(__dirname, "..", "deployments.json");
    if (fs.existsSync(deploymentPath)) {
      const deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      const chainId = config.network === "amoy" ? 80002 : 137;
      const deployment = deployments[chainId];
      
      if (deployment) {
        console.log(`   ✅ Contract: ${deployment.contractAddress}`);
        console.log(`   ✅ Network: ${deployment.network}`);
        console.log(`   ✅ Block: ${deployment.blockNumber}`);
        
        // Update .env
        const envPath = path.join(__dirname, "..", "..", ".env");
        let envContent = "";
        
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, "utf8");
          if (envContent.includes("ARBITRAGE_CONTRACT=")) {
            envContent = envContent.replace(
              /ARBITRAGE_CONTRACT=.*/,
              `ARBITRAGE_CONTRACT=${deployment.contractAddress}`
            );
          } else {
            envContent += `\nARBITRAGE_CONTRACT=${deployment.contractAddress}\n`;
          }
        } else {
          envContent = `ARBITRAGE_CONTRACT=${deployment.contractAddress}\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log("   ✅ Updated .env file");
      }
    }
    console.log("✅ Monitoring configured\n");
  } catch (error: any) {
    console.warn("⚠️ Monitoring setup warning:", error.message, "\n");
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("🎉 ONE-CLICK DEPLOYMENT COMPLETED!");
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n📋 NEXT STEPS:\n");
  console.log("1️⃣ Open Settings → Network to verify contract address");
  console.log("2️⃣ Click 'Authorize Executor' button to enable trading");
  console.log("3️⃣ Start bot from Dashboard\n");
  
  if (config.enableSimulation) {
    console.log("💡 TIP: Tenderly simulation is enabled. All trades will be");
    console.log("        simulated before execution.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ ONE-CLICK DEPLOYMENT FAILED:\n", error);
    process.exit(1);
  });

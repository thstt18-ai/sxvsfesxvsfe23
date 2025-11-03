
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface GasSnapshot {
  contract: string;
  function: string;
  gasUsed: number;
  timestamp: string;
}

async function main() {
  console.log("⛽ Generating gas snapshots...\n");

  const snapshots: GasSnapshot[] = [];
  const [deployer] = await ethers.getSigners();

  // Deploy ArbitrageExecutor
  const ArbitrageExecutor = await ethers.getContractFactory("ArbitrageExecutor");
  
  const poolAddressProvider = "0x0496275d34753A48320CA58103d5220d394FF77F"; // Amoy
  const usdcAddress = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  const pausers = [deployer.address];
  const trustedForwarder = "0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b";

  console.log("Deploying contract...");
  const contract = await ethers.deployContract(
    "ArbitrageExecutor",
    [trustedForwarder],
    { gasLimit: 10000000 }
  );
  await contract.waitForDeployment();

  const deployTx = contract.deploymentTransaction();
  if (deployTx) {
    const receipt = await deployTx.wait();
    snapshots.push({
      contract: "ArbitrageExecutor",
      function: "deployment",
      gasUsed: Number(receipt?.gasUsed || 0),
      timestamp: new Date().toISOString(),
    });
  }

  // Initialize
  console.log("Initializing contract...");
  const initTx = await contract.initialize(poolAddressProvider, usdcAddress, pausers);
  const initReceipt = await initTx.wait();
  snapshots.push({
    contract: "ArbitrageExecutor",
    function: "initialize",
    gasUsed: Number(initReceipt?.gasUsed || 0),
    timestamp: new Date().toISOString(),
  });

  // Test authorize executor
  console.log("Testing authorizeExecutor...");
  const authTx = await contract.authorizeExecutor(deployer.address);
  const authReceipt = await authTx.wait();
  snapshots.push({
    contract: "ArbitrageExecutor",
    function: "authorizeExecutor",
    gasUsed: Number(authReceipt?.gasUsed || 0),
    timestamp: new Date().toISOString(),
  });

  // Save snapshots
  const snapshotPath = path.join(__dirname, "..", ".gas-snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2));

  // Display results
  console.log("\n" + "=".repeat(80));
  console.log("⛽ GAS USAGE SNAPSHOT");
  console.log("=".repeat(80));
  
  snapshots.forEach((snapshot) => {
    console.log(
      `${snapshot.function.padEnd(25)} ${snapshot.gasUsed.toString().padStart(10)} gas`
    );
  });
  
  console.log("=".repeat(80));
  console.log(`\n✅ Snapshot saved to ${snapshotPath}\n`);

  // Generate CSV for analysis
  const csvPath = path.join(__dirname, "..", "gas-usage.csv");
  const csvContent = [
    "Contract,Function,GasUsed,Timestamp",
    ...snapshots.map(s => `${s.contract},${s.function},${s.gasUsed},${s.timestamp}`)
  ].join("\n");
  
  fs.writeFileSync(csvPath, csvContent);
  console.log(`✅ CSV saved to ${csvPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

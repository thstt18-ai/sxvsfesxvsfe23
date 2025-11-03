
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const SPURIOUS_DRAGON_LIMIT = 24576; // 24 KB
const WARNING_THRESHOLD = 0.9; // 90% of limit

async function main() {
  console.log("📏 Checking contract sizes...\n");

  const artifactsPath = path.join(__dirname, "..", "artifacts", "contracts");
  
  if (!fs.existsSync(artifactsPath)) {
    console.error("❌ Artifacts not found. Run 'npm run compile' first.");
    process.exit(1);
  }

  let hasOversized = false;
  let hasWarnings = false;

  function checkDirectory(dir: string) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        checkDirectory(filePath);
      } else if (file.endsWith(".json") && !file.endsWith(".dbg.json")) {
        const artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
        
        if (artifact.bytecode && artifact.bytecode !== "0x") {
          const bytecode = artifact.bytecode.replace("0x", "");
          const sizeInBytes = bytecode.length / 2;
          const percentOfLimit = (sizeInBytes / SPURIOUS_DRAGON_LIMIT) * 100;
          
          const contractName = artifact.contractName || path.basename(file, ".json");
          
          let status = "✅";
          if (sizeInBytes > SPURIOUS_DRAGON_LIMIT) {
            status = "❌ EXCEEDS LIMIT";
            hasOversized = true;
          } else if (sizeInBytes > SPURIOUS_DRAGON_LIMIT * WARNING_THRESHOLD) {
            status = "⚠️ WARNING";
            hasWarnings = true;
          }
          
          console.log(
            `${status} ${contractName.padEnd(30)} ` +
            `${sizeInBytes.toString().padStart(6)} bytes ` +
            `(${percentOfLimit.toFixed(1).padStart(5)}% of limit)`
          );
        }
      }
    }
  }

  checkDirectory(artifactsPath);

  console.log("\n" + "=".repeat(80));
  console.log(`📊 Size Limit: ${SPURIOUS_DRAGON_LIMIT} bytes (24 KB)`);
  console.log(`⚠️  Warning Threshold: ${Math.floor(SPURIOUS_DRAGON_LIMIT * WARNING_THRESHOLD)} bytes (${WARNING_THRESHOLD * 100}%)`);
  console.log("=".repeat(80) + "\n");

  if (hasOversized) {
    console.error("❌ FAILED: One or more contracts exceed the 24 KB size limit!");
    console.error("Consider:");
    console.error("  - Using libraries for repeated code");
    console.error("  - Splitting large contracts into smaller ones");
    console.error("  - Removing unused functions");
    console.error("  - Using inheritance instead of composition");
    process.exit(1);
  }

  if (hasWarnings) {
    console.warn("⚠️  WARNING: Some contracts are approaching the size limit.");
    console.warn("Consider optimization before adding more features.\n");
  } else {
    console.log("✅ All contracts are within safe size limits.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

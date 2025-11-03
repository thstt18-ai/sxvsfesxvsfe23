
import { ethers } from "hardhat";

async function main() {
  const proxyAddress = process.env.ARBITRAGE_CONTRACT;
  if (!proxyAddress) {
    throw new Error("ARBITRAGE_CONTRACT not set in .env");
  }

  console.log("💰 Checking Contract Balances");
  console.log("Proxy Address:", proxyAddress);
  console.log("================================");

  const provider = ethers.provider;
  
  // Check MATIC balance
  const maticBalance = await provider.getBalance(proxyAddress);
  console.log("MATIC Balance:", ethers.formatEther(maticBalance), "MATIC");

  // Check USDC balance
  const usdcAddress = process.env.USDC_ADDRESS || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  const IERC20 = await ethers.getContractFactory("IERC20");
  const usdc = IERC20.attach(usdcAddress);
  
  const usdcBalance = await usdc.balanceOf(proxyAddress);
  console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6), "USDC");
  
  console.log("================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

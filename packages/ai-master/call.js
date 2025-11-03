
const { ethers } = require('hardhat');
require('dotenv').config({ path: '../../.env' });

async function main() {
  try {
    const [signer] = await ethers.getSigners();
    console.log('Signer address:', signer.address);

    const routerAddress = process.env.ROUTER_ADDRESS;
    const usdcAddress = process.env.USDC;
    const wmaticAddress = process.env.WMATIC;

    if (!routerAddress || !usdcAddress || !wmaticAddress) {
      throw new Error('Missing environment variables: ROUTER_ADDRESS, USDC, or WMATIC');
    }

    console.log('Router:', routerAddress);
    console.log('USDC:', usdcAddress);
    console.log('WMATIC:', wmaticAddress);

    // Get Router contract (assuming Uniswap V2 Router interface)
    const Router = await ethers.getContractAt('IUniswapV2Router02', routerAddress);

    // Prepare swap parameters
    const amountIn = ethers.parseUnits('100', 18);
    const amountOutMin = ethers.parseUnits('90', 18);
    const path = [usdcAddress, wmaticAddress];
    const to = signer.address;
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    console.log('\nExecuting swap...');
    console.log('Amount In:', ethers.formatUnits(amountIn, 18));
    console.log('Min Amount Out:', ethers.formatUnits(amountOutMin, 18));

    const tx = await Router.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      to,
      deadline
    );

    console.log('Transaction hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

async function main() {
  const contractsDir = path.join(process.cwd());
  
  console.log('📦 Step 1: Installing missing dependencies...');
  try {
    const { stdout: installOut, stderr: installErr } = await execAsync('npm install --legacy-peer-deps', {
      cwd: contractsDir,
      timeout: 180000
    });
    
    if (installOut) console.log(installOut);
    if (installErr) console.error(installErr);
    console.log('✅ Dependencies installed successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }

  console.log('🔨 Step 2: Compiling contracts...');
  try {
    const { stdout: compileOut, stderr: compileErr } = await execAsync('npx hardhat compile', {
      cwd: contractsDir,
      timeout: 120000
    });
    
    if (compileOut) console.log(compileOut);
    if (compileErr) console.error(compileErr);
    console.log('✅ Contracts compiled successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to compile contracts:', error.message);
    process.exit(1);
  }

  console.log('🚀 Step 3: Deploying ArbitrageExecutor with Aave Pool...');
  const network = process.env.DEPLOY_NETWORK || 'amoy';
  
  try {
    const { stdout: deployOut, stderr: deployErr } = await execAsync(`npx hardhat run scripts/deploy-aave-pool.ts --network ${network}`, {
      cwd: contractsDir,
      timeout: 180000
    });
    
    if (deployOut) console.log(deployOut);
    if (deployErr && !deployErr.includes('Warning')) console.error(deployErr);
    console.log('✅ ArbitrageExecutor deployed successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to deploy contract:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }

  console.log('✅ All steps completed successfully!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

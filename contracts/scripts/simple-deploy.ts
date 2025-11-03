import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

async function main() {
  const contractsDir = path.join(process.cwd());
  const network = process.env.DEPLOY_NETWORK || 'amoy';
  
  console.log(`📝 Deploying to network: ${network}`);
  console.log('📍 Working directory:', contractsDir);
  console.log('');

  try {
    console.log('🔨 Compiling contracts...');
    const { stdout: compileOut, stderr: compileErr } = await execAsync('npx hardhat compile', {
      cwd: contractsDir,
      timeout: 120000
    });
    
    if (compileOut) console.log(compileOut);
    if (compileErr && !compileErr.includes('Warning')) console.error(compileErr);
    console.log('✅ Contracts compiled\n');
  } catch (error: any) {
    console.error('❌ Compilation failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }

  try {
    console.log('🚀 Deploying ArbitrageExecutor with Aave Pool...');
    const { stdout: deployOut, stderr: deployErr } = await execAsync(`npx hardhat run scripts/deploy-aave-pool.ts --network ${network}`, {
      cwd: contractsDir,
      timeout: 180000
    });
    
    if (deployOut) console.log(deployOut);
    if (deployErr && !deployErr.includes('Warning')) console.error(deployErr);
    console.log('✅ Deployment completed\n');
  } catch (error: any) {
    console.error('❌ Deployment failed:', error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
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

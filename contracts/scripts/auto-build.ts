
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

async function main() {
  const contractsDir = path.join(process.cwd());
  
  console.log('🔨 Starting automatic contract build...\n');

  try {
    console.log('📦 Installing dependencies...');
    const { stdout: installOut } = await execAsync('npm install --legacy-peer-deps', {
      cwd: contractsDir,
      timeout: 180000
    });
    
    if (installOut) console.log(installOut);
    console.log('✅ Dependencies installed\n');

    console.log('🔨 Compiling contracts...');
    const { stdout: compileOut } = await execAsync('npx hardhat compile', {
      cwd: contractsDir,
      timeout: 120000
    });
    
    if (compileOut) console.log(compileOut);
    console.log('✅ Contracts compiled successfully\n');

    console.log('📏 Checking contract sizes...');
    const { stdout: sizeOut } = await execAsync('npx hardhat size-contracts', {
      cwd: contractsDir,
      timeout: 30000
    });
    
    if (sizeOut) console.log(sizeOut);

    console.log('\n✅ Build completed successfully!');
  } catch (error: any) {
    console.error('❌ Build failed:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

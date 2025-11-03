import hre from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CI-safe transaction signing using encrypted keystore
 * NO Ledger dependency - production-ready for automated deployment
 */
async function main() {
  console.log('🔐 CI Transaction Signing (Encrypted Keystore)');
  
  // Load or create encrypted keystore
  const keystorePath = process.env.KEYSTORE_PATH || path.join(__dirname, '../.keystore.json');
  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  
  if (!keystorePassword) {
    throw new Error('KEYSTORE_PASSWORD environment variable required');
  }
  
  let wallet;
  
  // Check if keystore exists
  if (fs.existsSync(keystorePath)) {
    console.log('📁 Loading existing keystore...');
    const keystoreJson = fs.readFileSync(keystorePath, 'utf8');
    wallet = await hre.ethers.Wallet.fromEncryptedJson(keystoreJson, keystorePassword);
    console.log(`✅ Wallet loaded: ${wallet.address}`);
  } else {
    // Create new wallet if keystore doesn't exist
    console.log('🆕 Creating new encrypted keystore...');
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY required to create new keystore');
    }
    
    wallet = new hre.ethers.Wallet(privateKey);
    
    // Encrypt and save
    const encryptedJson = await wallet.encrypt(keystorePassword);
    fs.writeFileSync(keystorePath, encryptedJson);
    console.log(`✅ Keystore created: ${wallet.address}`);
    console.log(`📁 Saved to: ${keystorePath}`);
  }
  
  // Connect wallet to provider
  wallet = wallet.connect(hre.ethers.provider);
  
  const balance = await hre.ethers.provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} MATIC`);
  
  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`🌐 Network: ${chainId === 137 ? 'Polygon Mainnet' : chainId === 80002 ? 'Polygon Amoy' : 'Unknown'}`);
  
  // Get deployment parameters
  const poolAddressProvider = process.env.POOL_ADDRESS_PROVIDER || 
    (chainId === 137 ? '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' : '0x0496275d34753A48320CA58103d5220d394FF77F');
  const usdcAddress = process.env.USDC_ADDRESS || 
    (chainId === 137 ? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' : '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582');
  const trustedForwarder = process.env.TRUSTED_FORWARDER || 
    (chainId === 137 ? '0x86C80a8aa58e0A4fa09A69624c31Ab2a6CAD56b8' : '0x9399BB24DBB5C4b782C70c2969F58716Ebbd6a3b');
  
  // Prepare deployment transaction
  const ArbitrageExecutor = await hre.ethers.getContractFactory('ArbitrageExecutor', wallet);
  
  const pausers = [wallet.address, wallet.address, wallet.address]; // Simplified for CI
  
  console.log('📝 Preparing deployment transaction...');
  console.log('   Pool Address Provider:', poolAddressProvider);
  console.log('   USDC Address:', usdcAddress);
  console.log('   Trusted Forwarder:', trustedForwarder);
  
  // Get deploy transaction
  const deployTx = await ArbitrageExecutor.getDeployTransaction(poolAddressProvider);
  
  // Populate transaction
  const unsignedTx = await wallet.populateTransaction({
    ...deployTx,
    gasLimit: 5000000,
    maxPriorityFeePerGas: hre.ethers.parseUnits('30', 'gwei'),
    maxFeePerGas: hre.ethers.parseUnits('100', 'gwei')
  });
  
  console.log('🔐 Signing transaction with encrypted keystore...');
  
  // Sign transaction - THIS FIXES HH12 ERROR
  const signedTx = await wallet.signTransaction(unsignedTx);
  
  // Calculate transaction hash from signed transaction
  const txHash = hre.ethers.keccak256(signedTx);
  
  console.log(`✅ Transaction signed successfully!`);
  console.log(`📝 Transaction Hash: ${txHash}`);
  
  // Save signed transaction to artifact for CI/CD
  const artifactPath = path.join(__dirname, '../artifacts/signed-deployment.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  
  const artifact = {
    signedTransaction: signedTx,
    transactionHash: txHash,
    signer: wallet.address,
    network: chainId,
    timestamp: new Date().toISOString(),
    parameters: {
      poolAddressProvider,
      usdcAddress,
      trustedForwarder
    }
  };
  
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`💾 Signed transaction artifact saved: ${artifactPath}`);
  
  // Optional: broadcast transaction
  if (process.env.BROADCAST === 'true') {
    console.log('📡 Broadcasting transaction...');
    const txResponse = await hre.ethers.provider.broadcastTransaction(signedTx);
    console.log(`✅ Transaction broadcast: ${txResponse.hash}`);
    
    console.log('⏳ Waiting for confirmation...');
    const receipt = await txResponse.wait();
    console.log(`✅ Transaction confirmed in block: ${receipt?.blockNumber}`);
    console.log(`📜 Contract address: ${receipt?.contractAddress}`);
  } else {
    console.log('ℹ️  Set BROADCAST=true to automatically broadcast the transaction');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

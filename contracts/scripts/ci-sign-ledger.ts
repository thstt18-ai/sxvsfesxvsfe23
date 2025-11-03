
import { ethers } from 'hardhat';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import Eth from '@ledgerhq/hw-app-eth';

async function main() {
  const transport = await TransportNodeHid.create();
  const eth = new Eth(transport);
  
  const derivationPath = "m/44'/60'/0'/0/0";
  const { address } = await eth.getAddress(derivationPath);
  
  console.log(`📟 Ledger address: ${address}`);

  const ArbitrageExecutor = await ethers.getContractFactory('ArbitrageExecutor');
  const tx = await ArbitrageExecutor.getDeployTransaction(
    process.env.POOL_ADDRESS_PROVIDER || '',
    process.env.SWAP_ROUTER || '',
    process.env.CHAINLINK_PRICE_FEED || ''
  );

  const unsignedTx = await ethers.provider.populateTransaction({
    ...tx,
    from: address,
    gasLimit: 5000000
  });

  const serializedTx = ethers.Transaction.from(unsignedTx).unsignedSerialized;
  
  console.log('🔐 Signing transaction with Ledger...');
  const signature = await eth.signTransaction(derivationPath, serializedTx.slice(2));
  
  const signedTx = ethers.Transaction.from(unsignedTx);
  signedTx.signature = signature;

  const txResponse = await ethers.provider.broadcastTransaction(signedTx.serialized);
  
  console.log(`✅ Transaction hash: ${txResponse.hash}`);
  await txResponse.wait();
  
  await transport.close();
}

main().catch(console.error);

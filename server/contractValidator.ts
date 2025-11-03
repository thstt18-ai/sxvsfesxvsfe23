
import { ethers } from 'ethers';
import { storage } from './storage';

export async function validateContract(contractAddress: string, provider: ethers.Provider): Promise<boolean> {
  try {
    // Проверка развернутого кода
    const code = await provider.getCode(contractAddress);
    if (code === '0x' || code === '0x0') {
      throw new Error('Контракт не развернут по указанному адресу!');
    }

    // Проверка базового взаимодействия
    const contract = new ethers.Contract(
      contractAddress,
      ['function owner() view returns (address)'],
      provider
    );

    const owner = await contract.owner();
    console.log('✅ Contract validated, owner:', owner);

    // Сохранение в БД
    await storage.run(
      `INSERT OR REPLACE INTO contract_deployments (address, network, validated_at) VALUES (?, ?, ?)`,
      [contractAddress, await provider.getNetwork().then(n => n.name), new Date().toISOString()]
    );

    return true;
  } catch (error: any) {
    console.error('❌ Contract validation failed:', error.message);
    return false;
  }
}

export async function getContractForNetwork(network: 'polygon' | 'amoy'): Promise<string | null> {
  const result = await storage.get(
    `SELECT address FROM contract_deployments WHERE network = ? ORDER BY validated_at DESC LIMIT 1`,
    [network]
  );
  return result?.address || null;
}


import { ethers } from 'ethers';
import { web3Provider } from './web3Provider';
import { storage } from './storage';

export class NetworkDiagnostics {
  /**
   * Comprehensive network diagnostic check
   */
  async diagnoseNetwork(userId: string, chainId: number): Promise<void> {
    try {
      const provider = web3Provider.getProvider(chainId);
      const networkName = chainId === 137 ? 'Polygon Mainnet' : 'Polygon Amoy Testnet';

      await storage.createActivityLog(userId, {
        type: 'system',
        level: 'info',
        message: `🔧 Диагностика сети: ${networkName} (Chain ID: ${chainId})`,
        metadata: { chainId, networkName },
      });

      // Check 1: Network connectivity
      try {
        const network = await provider.getNetwork();
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'success',
          message: `✅ Подключение к сети успешно (Chain ID: ${network.chainId})`,
          metadata: { chainId: network.chainId.toString() },
        });
      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'error',
          message: `❌ Ошибка подключения к сети: ${error.message}`,
          metadata: { error: error.message },
        });
        return;
      }

      // Check 2: Block number (ensures RPC is synced)
      try {
        const blockNumber = await provider.getBlockNumber();
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'success',
          message: `✅ Текущий блок: ${blockNumber}`,
          metadata: { blockNumber },
        });
      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'warning',
          message: `⚠️ Не удалось получить номер блока: ${error.message}`,
          metadata: { error: error.message },
        });
      }

      // Check 3: Gas price
      try {
        const feeData = await provider.getFeeData();
        const gasGwei = feeData.gasPrice ? parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')) : 0;
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'success',
          message: `✅ Текущая цена газа: ${gasGwei.toFixed(2)} Gwei`,
          metadata: { gasGwei },
        });
      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'warning',
          message: `⚠️ Не удалось получить цену газа: ${error.message}`,
          metadata: { error: error.message },
        });
      }

      // Check 4: WMATIC contract
      try {
        const wmaticAddress = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
        const code = await provider.getCode(wmaticAddress);
        
        if (code === '0x' || code === '0x0') {
          await storage.createActivityLog(userId, {
            type: 'system',
            level: 'warning',
            message: `⚠️ WMATIC контракт не найден на ${networkName}. Это нормально для тестовой сети - используются mock данные.`,
            metadata: { wmaticAddress },
          });
        } else {
          await storage.createActivityLog(userId, {
            type: 'system',
            level: 'success',
            message: `✅ WMATIC контракт найден (${code.length} байт)`,
            metadata: { wmaticAddress, codeLength: code.length },
          });
        }
      } catch (error: any) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'warning',
          message: `⚠️ Ошибка проверки WMATIC контракта: ${error.message}`,
          metadata: { error: error.message },
        });
      }

    } catch (error: any) {
      await storage.createActivityLog(userId, {
        type: 'system',
        level: 'error',
        message: `❌ Диагностика сети не удалась: ${error.message}`,
        metadata: { error: error.message, stack: error.stack },
      });
    }
  }
}

export const networkDiagnostics = new NetworkDiagnostics();

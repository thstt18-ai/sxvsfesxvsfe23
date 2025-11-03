
import { ethers } from 'ethers';
import { storage } from './storage';

export class KillSwitch {
  /**
   * Аварийная остановка всех операций
   */
  async emergencyStop(
    userId: string,
    reason: string = 'Manual emergency stop'
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🚨 EMERGENCY STOP ACTIVATED');
      console.log(`   Reason: ${reason}`);

      // 1. Останавливаем бота
      await storage.updateBotStatus(userId, {
        isRunning: false,
        isPaused: true,
        pauseReason: `EMERGENCY STOP: ${reason}`,
      });

      // 2. Останавливаем сканер возможностей
      const { opportunityScanner } = await import('./opportunityScanner');
      opportunityScanner.stopScanning();

      // 3. Логируем событие
      await storage.createActivityLog(userId, {
        type: 'emergency_stop',
        level: 'error',
        message: `🚨 EMERGENCY STOP: ${reason}`,
        metadata: {
          timestamp: new Date().toISOString(),
          reason,
        },
      });

      // 4. Создаём событие circuit breaker
      await storage.createCircuitBreakerEvent(userId, {
        reason: 'emergency_stop',
        triggerValue: '1',
        thresholdValue: '1',
      });

      console.log('✅ Emergency stop completed');

      return {
        success: true,
        message: 'All trading operations stopped. Manual restart required.',
      };
    } catch (error: any) {
      console.error('Error during emergency stop:', error);
      return {
        success: false,
        message: `Emergency stop failed: ${error.message}`,
      };
    }
  }

  /**
   * Отмена pending транзакций (через замену nonce)
   */
  async cancelPendingTransactions(
    wallet: ethers.Wallet
  ): Promise<{ cancelled: number; txHash?: string }> {
    try {
      const provider = wallet.provider as ethers.JsonRpcProvider;
      const currentNonce = await provider.getTransactionCount(wallet.address, 'pending');
      const latestNonce = await provider.getTransactionCount(wallet.address, 'latest');

      if (currentNonce === latestNonce) {
        console.log('No pending transactions to cancel');
        return { cancelled: 0 };
      }

      // Отправляем self-transfer с высоким газом для замены pending tx
      const feeData = await provider.getFeeData();
      const tx = await wallet.sendTransaction({
        to: wallet.address,
        value: 0,
        nonce: latestNonce,
        gasLimit: 21000,
        maxFeePerGas: feeData.maxFeePerGas! * BigInt(2), // 2x gas
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas! * BigInt(2),
      });

      console.log(`📝 Cancellation tx sent: ${tx.hash}`);
      
      return {
        cancelled: currentNonce - latestNonce,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('Error cancelling pending transactions:', error);
      throw error;
    }
  }
}

export const killSwitch = new KillSwitch();

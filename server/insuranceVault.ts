
import { storage } from './storage';
import { ethers } from 'ethers';

export interface InsuranceVaultState {
  totalFunds: number; // USD
  totalCoverage: number; // USD
  claimsPaid: number;
  activeInsurances: number;
  revenueShare: number; // percentage
}

export class InsuranceVault {
  private state: InsuranceVaultState = {
    totalFunds: 0,
    totalCoverage: 0,
    claimsPaid: 0,
    activeInsurances: 0,
    revenueShare: 10, // 10% auto-reinvest
  };

  /**
   * Deposit profit into insurance vault
   */
  async depositProfit(userId: string, profitUsd: number): Promise<void> {
    const shareAmount = profitUsd * (this.state.revenueShare / 100);
    this.state.totalFunds += shareAmount;

    await storage.createActivityLog(userId, {
      type: 'insurance_vault',
      level: 'success',
      message: `💰 Прибыль ${profitUsd.toFixed(2)} USD → ${shareAmount.toFixed(2)} USD в страховой vault (${this.state.revenueShare}%)`,
      metadata: {
        profit: profitUsd,
        share: shareAmount,
        totalFunds: this.state.totalFunds,
      },
    });
  }

  /**
   * Process insurance claim
   */
  async processClaim(userId: string, lossUsd: number): Promise<{ success: boolean; covered: number }> {
    const maxCoverage = this.state.totalFunds * 0.5; // Max 50% of vault
    const coveredAmount = Math.min(lossUsd, maxCoverage);

    if (coveredAmount > 0) {
      this.state.totalFunds -= coveredAmount;
      this.state.claimsPaid += coveredAmount;

      await storage.createActivityLog(userId, {
        type: 'insurance_claim',
        level: 'warning',
        message: `🛡️ Страховое покрытие убытка: ${coveredAmount.toFixed(2)} USD из ${lossUsd.toFixed(2)} USD`,
        metadata: {
          loss: lossUsd,
          covered: coveredAmount,
          remaining: this.state.totalFunds,
        },
      });

      return { success: true, covered: coveredAmount };
    }

    return { success: false, covered: 0 };
  }

  /**
   * Get vault state
   */
  getState(): InsuranceVaultState {
    return this.state;
  }

  /**
   * Update revenue share percentage
   */
  setRevenueShare(percentage: number): void {
    this.state.revenueShare = Math.min(100, Math.max(0, percentage));
  }
}

export const insuranceVault = new InsuranceVault();

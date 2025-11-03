
import { storage } from './storage';
import { ethers } from 'ethers';

export interface StakingPosition {
  id: string;
  userId: string;
  lpToken: string;
  amount: number;
  apr: number;
  startTime: number;
  earned: number;
}

export class StakingFarming {
  private positions: Map<string, StakingPosition> = new Map();

  /**
   * Stake LP tokens
   */
  async stake(
    userId: string,
    lpToken: string,
    amount: number
  ): Promise<{ success: boolean; positionId: string }> {
    const positionId = `stake-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Simulate APR based on LP token
    const apr = this.getAPR(lpToken);

    const position: StakingPosition = {
      id: positionId,
      userId,
      lpToken,
      amount,
      apr,
      startTime: Date.now(),
      earned: 0,
    };

    this.positions.set(positionId, position);

    await storage.createActivityLog(userId, {
      type: 'staking',
      level: 'success',
      message: `🌾 Застейкано ${amount.toFixed(2)} LP токенов (APR: ${apr}%)`,
      metadata: position,
    });

    return { success: true, positionId };
  }

  /**
   * Unstake LP tokens
   */
  async unstake(userId: string, positionId: string): Promise<{ success: boolean; earned: number }> {
    const position = this.positions.get(positionId);

    if (!position || position.userId !== userId) {
      return { success: false, earned: 0 };
    }

    // Calculate earnings
    const durationMs = Date.now() - position.startTime;
    const durationDays = durationMs / (1000 * 60 * 60 * 24);
    const earned = position.amount * (position.apr / 100) * (durationDays / 365);

    this.positions.delete(positionId);

    await storage.createActivityLog(userId, {
      type: 'unstaking',
      level: 'success',
      message: `💰 Анстейкано ${position.amount.toFixed(2)} LP + ${earned.toFixed(2)} награда (${durationDays.toFixed(1)} дней)`,
      metadata: {
        amount: position.amount,
        earned,
        duration: durationDays,
      },
    });

    return { success: true, earned };
  }

  /**
   * Get all positions for user
   */
  getPositions(userId: string): StakingPosition[] {
    return Array.from(this.positions.values()).filter(p => p.userId === userId);
  }

  /**
   * Get APR for LP token
   */
  private getAPR(lpToken: string): number {
    // Simulate different APRs
    const aprs: Record<string, number> = {
      'ETH-USDT': 15.5,
      'ETH-POL': 22.3,
      'POL-USDT': 18.7,
    };
    return aprs[lpToken] || 12.0;
  }
}

export const stakingFarming = new StakingFarming();

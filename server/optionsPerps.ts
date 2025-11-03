
import { storage } from './storage';

export interface OptionContract {
  id: string;
  userId: string;
  type: 'call' | 'put';
  underlying: string;
  strikePrice: number;
  expiryTime: number;
  premium: number;
  size: number;
  status: 'active' | 'exercised' | 'expired';
}

export interface PerpPosition {
  id: string;
  userId: string;
  pair: string;
  size: number;
  leverage: number;
  entryPrice: number;
  liquidationPrice: number;
  pnl: number;
  fundingRate: number;
}

export class OptionsPerps {
  private options: Map<string, OptionContract> = new Map();
  private perps: Map<string, PerpPosition> = new Map();

  /**
   * Buy call/put option
   */
  async buyOption(
    userId: string,
    type: 'call' | 'put',
    underlying: string,
    strikePrice: number,
    expiryHours: number,
    size: number
  ): Promise<{ success: boolean; optionId: string; premium: number }> {
    const optionId = `opt-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Calculate premium (simplified Black-Scholes)
    const premium = size * strikePrice * 0.05; // 5% of notional

    const option: OptionContract = {
      id: optionId,
      userId,
      type,
      underlying,
      strikePrice,
      expiryTime: Date.now() + expiryHours * 60 * 60 * 1000,
      premium,
      size,
      status: 'active',
    };

    this.options.set(optionId, option);

    await storage.createActivityLog(userId, {
      type: 'options',
      level: 'success',
      message: `📊 Куплен ${type.toUpperCase()} опцион ${underlying} @ ${strikePrice} (премия: ${premium.toFixed(2)} USD)`,
      metadata: option,
    });

    return { success: true, optionId, premium };
  }

  /**
   * Open perpetual position
   */
  async openPerp(
    userId: string,
    pair: string,
    size: number,
    leverage: number,
    entryPrice: number
  ): Promise<{ success: boolean; positionId: string }> {
    const positionId = `perp-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Calculate liquidation price
    const liquidationPrice = entryPrice * (1 - 1 / leverage * 0.8);

    const position: PerpPosition = {
      id: positionId,
      userId,
      pair,
      size,
      leverage,
      entryPrice,
      liquidationPrice,
      pnl: 0,
      fundingRate: -0.01, // -0.01% funding rate
    };

    this.perps.set(positionId, position);

    await storage.createActivityLog(userId, {
      type: 'perp',
      level: 'success',
      message: `⚡ Открыт PERP ${pair} ${size} USD x${leverage} @ ${entryPrice} (ликв: ${liquidationPrice.toFixed(2)})`,
      metadata: position,
    });

    return { success: true, positionId };
  }

  /**
   * Close perpetual position
   */
  async closePerp(userId: string, positionId: string, exitPrice: number): Promise<{ success: boolean; pnl: number }> {
    const position = this.perps.get(positionId);

    if (!position || position.userId !== userId) {
      return { success: false, pnl: 0 };
    }

    // Calculate PnL
    const priceChange = (exitPrice - position.entryPrice) / position.entryPrice;
    const pnl = position.size * priceChange * position.leverage;

    this.perps.delete(positionId);

    await storage.createActivityLog(userId, {
      type: 'perp_close',
      level: pnl > 0 ? 'success' : 'warning',
      message: `💰 Закрыт PERP ${position.pair}: PnL ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USD`,
      metadata: {
        entry: position.entryPrice,
        exit: exitPrice,
        pnl,
        leverage: position.leverage,
      },
    });

    return { success: true, pnl };
  }

  /**
   * Get all active options
   */
  getOptions(userId: string): OptionContract[] {
    return Array.from(this.options.values()).filter(o => o.userId === userId && o.status === 'active');
  }

  /**
   * Get all active perps
   */
  getPerps(userId: string): PerpPosition[] {
    return Array.from(this.perps.values()).filter(p => p.userId === userId);
  }
}

export const optionsPerps = new OptionsPerps();

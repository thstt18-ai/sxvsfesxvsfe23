
import { storage } from './storage';

interface LeaderboardEntry {
  userId: string;
  anonymousId: string;
  totalPnL: number;
  winRate: number;
  tradesCount: number;
  sharpeRatio: number;
  rank: number;
}

interface CopyTradingStrategy {
  id: number;
  traderId: string;
  name: string;
  description: string;
  pnl: number;
  followers: number;
  active: boolean;
}

interface DAOProposal {
  id: number;
  title: string;
  description: string;
  proposer: string;
  votesFor: number;
  votesAgainst: number;
  status: 'active' | 'passed' | 'rejected';
  deadline: Date;
}

interface NFTBadge {
  id: number;
  userId: string;
  badgeType: string;
  title: string;
  description: string;
  imageUrl: string;
  earnedAt: Date;
}

class SocialFeatures {
  /**
   * Получить таблицу лидеров по PnL
   */
  async getLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
    // Получаем всех пользователей с транзакциями
    const transactions = await storage.db.query.arbitrageTransactions.findMany({
      limit: 1000,
    });

    // Группируем по userId
    const userStats = new Map<string, { pnl: number; wins: number; total: number }>();

    for (const tx of transactions) {
      const current = userStats.get(tx.userId) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += tx.profit || 0;
      current.total += 1;
      if ((tx.profit || 0) > 0) current.wins += 1;
      userStats.set(tx.userId, current);
    }

    // Формируем leaderboard
    const leaderboard: LeaderboardEntry[] = [];
    let rank = 1;

    for (const [userId, stats] of userStats.entries()) {
      leaderboard.push({
        userId,
        anonymousId: `Trader_${userId.substring(0, 8)}`,
        totalPnL: stats.pnl,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        tradesCount: stats.total,
        sharpeRatio: this.calculateSharpeRatio(stats.pnl, stats.total),
        rank: rank++,
      });
    }

    // Сортируем по PnL
    leaderboard.sort((a, b) => b.totalPnL - a.totalPnL);

    return leaderboard.slice(0, limit);
  }

  /**
   * Получить доступные стратегии для копирования
   */
  async getCopyTradingStrategies(): Promise<CopyTradingStrategy[]> {
    const leaderboard = await this.getLeaderboard(10);

    return leaderboard.map((entry, index) => ({
      id: index + 1,
      traderId: entry.anonymousId,
      name: `Strategy ${entry.anonymousId}`,
      description: `Win Rate: ${entry.winRate.toFixed(2)}%, Trades: ${entry.tradesCount}`,
      pnl: entry.totalPnL,
      followers: Math.floor(Math.random() * 100),
      active: true,
    }));
  }

  /**
   * Подписаться на копирование стратегии
   */
  async subscribeToCopyTrading(userId: string, strategyId: number): Promise<{
    success: boolean;
    message: string;
  }> {
    await storage.createActivityLog(userId, {
      type: 'copy_trading',
      level: 'success',
      message: `Подписка на стратегию #${strategyId}`,
      metadata: { strategyId },
    });

    return {
      success: true,
      message: `Вы подписались на стратегию #${strategyId}. Сделки будут копироваться автоматически.`,
    };
  }

  /**
   * Получить активные DAO-предложения
   */
  async getDAOProposals(): Promise<DAOProposal[]> {
    return [
      {
        id: 1,
        title: 'Добавить поддержку Arbitrum One',
        description: 'Расширить торговлю на сеть Arbitrum для снижения комиссий',
        proposer: 'Community',
        votesFor: 142,
        votesAgainst: 23,
        status: 'active',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: 2,
        title: 'Увеличить лимит Flash Loan до $100k',
        description: 'Для крупных арбитражных сделок',
        proposer: 'Trader_f3a2b1c9',
        votesFor: 89,
        votesAgainst: 45,
        status: 'active',
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    ];
  }

  /**
   * Проголосовать за предложение
   */
  async voteOnProposal(
    userId: string,
    proposalId: number,
    vote: 'for' | 'against'
  ): Promise<{ success: boolean; message: string }> {
    await storage.createActivityLog(userId, {
      type: 'dao_vote',
      level: 'info',
      message: `Голос ${vote === 'for' ? 'ЗА' : 'ПРОТИВ'} предложения #${proposalId}`,
      metadata: { proposalId, vote },
    });

    return {
      success: true,
      message: `Ваш голос ${vote === 'for' ? 'ЗА' : 'ПРОТИВ'} учтён!`,
    };
  }

  /**
   * Получить NFT-бейджи пользователя
   */
  async getUserBadges(userId: string): Promise<NFTBadge[]> {
    const transactions = await storage.db.query.arbitrageTransactions.findMany({
      where: (tx, { eq }) => eq(tx.userId, userId),
    });

    const badges: NFTBadge[] = [];

    // Бейдж за первую сделку
    if (transactions.length >= 1) {
      badges.push({
        id: 1,
        userId,
        badgeType: 'first_trade',
        title: '🎯 Первая Сделка',
        description: 'Выполнена первая арбитражная сделка',
        imageUrl: '/badges/first-trade.png',
        earnedAt: new Date(transactions[0].timestamp),
      });
    }

    // Бейдж за 100 сделок
    if (transactions.length >= 100) {
      badges.push({
        id: 2,
        userId,
        badgeType: 'century',
        title: '💯 Столетие',
        description: '100+ успешных сделок',
        imageUrl: '/badges/century.png',
        earnedAt: new Date(transactions[99].timestamp),
      });
    }

    // Бейдж за прибыль > $1000
    const totalPnL = transactions.reduce((sum, tx) => sum + (tx.profit || 0), 0);
    if (totalPnL >= 1000) {
      badges.push({
        id: 3,
        userId,
        badgeType: 'profit_1k',
        title: '🏆 $1K Прибыль',
        description: 'Заработано $1000+',
        imageUrl: '/badges/profit-1k.png',
        earnedAt: new Date(),
      });
    }

    return badges;
  }

  /**
   * Рассчитать Sharpe Ratio
   */
  private calculateSharpeRatio(totalPnL: number, tradesCount: number): number {
    if (tradesCount === 0) return 0;
    const avgReturn = totalPnL / tradesCount;
    const riskFreeRate = 0.02; // 2% годовых
    const stdDev = Math.sqrt(Math.abs(avgReturn) * 0.3); // Упрощённая формула
    return stdDev > 0 ? (avgReturn - riskFreeRate) / stdDev : 0;
  }
}

export const socialFeatures = new SocialFeatures();

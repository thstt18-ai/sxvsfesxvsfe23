
/**
 * Price Anomaly Detector - детектор аномалий цен для защиты от ошибочных сделок
 */

interface PriceHistory {
  timestamp: number;
  price: number;
}

interface AnomalyCheckResult {
  isValid: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export class PriceAnomalyDetector {
  private priceHistory: Map<string, PriceHistory[]> = new Map();
  private readonly MAX_HISTORY_SIZE = 100;
  private readonly MAX_PRICE_DEVIATION = 0.10; // 10% максимальное отклонение
  private readonly CRITICAL_PRICE_DEVIATION = 0.20; // 20% критическое отклонение
  private readonly MIN_HISTORY_FOR_CHECK = 5; // Минимум 5 точек для анализа

  /**
   * Добавить цену в историю
   */
  addPrice(tokenPair: string, price: number): void {
    if (!this.priceHistory.has(tokenPair)) {
      this.priceHistory.set(tokenPair, []);
    }

    const history = this.priceHistory.get(tokenPair)!;
    history.push({
      timestamp: Date.now(),
      price,
    });

    // Ограничиваем размер истории
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.shift();
    }
  }

  /**
   * Проверка цены на аномалии
   */
  checkPrice(tokenPair: string, currentPrice: number): AnomalyCheckResult {
    const history = this.priceHistory.get(tokenPair);

    // Если недостаточно истории - разрешаем торговлю с предупреждением
    if (!history || history.length < this.MIN_HISTORY_FOR_CHECK) {
      return {
        isValid: true,
        reason: 'Недостаточно истории цен для полного анализа',
        severity: 'low',
      };
    }

    // Вычисляем среднюю цену
    const avgPrice = history.reduce((sum, h) => sum + h.price, 0) / history.length;

    // Вычисляем стандартное отклонение
    const variance = history.reduce((sum, h) => sum + Math.pow(h.price - avgPrice, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);

    // Проверка на резкое отклонение от средней
    const deviation = Math.abs(currentPrice - avgPrice) / avgPrice;

    if (deviation > this.CRITICAL_PRICE_DEVIATION) {
      return {
        isValid: false,
        reason: `КРИТИЧЕСКОЕ отклонение цены ${(deviation * 100).toFixed(2)}% от средней ${avgPrice.toFixed(6)}`,
        severity: 'critical',
      };
    }

    if (deviation > this.MAX_PRICE_DEVIATION) {
      return {
        isValid: false,
        reason: `Высокое отклонение цены ${(deviation * 100).toFixed(2)}% от средней ${avgPrice.toFixed(6)}`,
        severity: 'high',
      };
    }

    // Проверка на аномальное изменение за последние 3 точки
    if (history.length >= 3) {
      const lastThree = history.slice(-3);
      const recentAvg = lastThree.reduce((sum, h) => sum + h.price, 0) / 3;
      const recentDeviation = Math.abs(currentPrice - recentAvg) / recentAvg;

      if (recentDeviation > this.MAX_PRICE_DEVIATION) {
        return {
          isValid: false,
          reason: `Резкое изменение цены ${(recentDeviation * 100).toFixed(2)}% за последние замеры`,
          severity: 'medium',
        };
      }
    }

    // Проверка на Z-score (статистическая аномалия)
    if (stdDev > 0) {
      const zScore = Math.abs((currentPrice - avgPrice) / stdDev);
      if (zScore > 3) {
        return {
          isValid: false,
          reason: `Статистическая аномалия (Z-score: ${zScore.toFixed(2)})`,
          severity: 'high',
        };
      }
    }

    return {
      isValid: true,
    };
  }

  /**
   * Очистка старой истории (старше 1 часа)
   */
  cleanOldHistory(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [tokenPair, history] of this.priceHistory.entries()) {
      const filtered = history.filter(h => h.timestamp > oneHourAgo);
      
      if (filtered.length === 0) {
        this.priceHistory.delete(tokenPair);
      } else {
        this.priceHistory.set(tokenPair, filtered);
      }
    }
  }

  /**
   * Получить статистику по паре
   */
  getStats(tokenPair: string): { avg: number; min: number; max: number; count: number } | null {
    const history = this.priceHistory.get(tokenPair);
    if (!history || history.length === 0) {
      return null;
    }

    const prices = history.map(h => h.price);
    return {
      avg: prices.reduce((sum, p) => sum + p, 0) / prices.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      count: prices.length,
    };
  }
}

// Export singleton
export const priceAnomalyDetector = new PriceAnomalyDetector();

// Периодическая очистка старой истории
setInterval(() => {
  priceAnomalyDetector.cleanOldHistory();
}, 10 * 60 * 1000); // Каждые 10 минут

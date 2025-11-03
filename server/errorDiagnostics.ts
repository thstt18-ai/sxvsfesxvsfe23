
/**
 * Error Diagnostics - система диагностики и анализа ошибок
 */

interface ErrorEntry {
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  context?: any;
  frequency: number;
}

export class ErrorDiagnostics {
  private errors: Map<string, ErrorEntry> = new Map();
  private readonly MAX_ERRORS = 1000;

  /**
   * Запись ошибки с контекстом
   */
  logError(type: string, error: Error | string, context?: any): void {
    const message = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;
    const key = `${type}:${message}`;

    if (this.errors.has(key)) {
      // Увеличиваем частоту повторяющейся ошибки
      const existing = this.errors.get(key)!;
      existing.frequency++;
      existing.timestamp = Date.now();
      existing.context = context; // Обновляем контекст последнего вхождения
    } else {
      // Новая ошибка
      this.errors.set(key, {
        timestamp: Date.now(),
        type,
        message,
        stack,
        context,
        frequency: 1,
      });

      // Ограничиваем размер Map
      if (this.errors.size > this.MAX_ERRORS) {
        const oldestKey = Array.from(this.errors.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        this.errors.delete(oldestKey);
      }
    }

    // Логируем критические ошибки
    if (this.isCriticalError(type, message)) {
      console.error(`🚨 КРИТИЧЕСКАЯ ОШИБКА [${type}]: ${message}`, context);
    }
  }

  /**
   * Определение критических ошибок
   */
  private isCriticalError(type: string, message: string): boolean {
    const criticalPatterns = [
      /cannot access .* before initialization/i,
      /out of gas/i,
      /insufficient funds/i,
      /transaction reverted/i,
      /connection lost/i,
      /network error/i,
    ];

    return criticalPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Получить топ ошибок по частоте
   */
  getTopErrors(limit: number = 10): ErrorEntry[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Получить недавние ошибки
   */
  getRecentErrors(minutes: number = 10): ErrorEntry[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return Array.from(this.errors.values())
      .filter(e => e.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Анализ паттернов ошибок
   */
  analyzePatterns(): {
    totalErrors: number;
    uniqueErrors: number;
    criticalErrors: number;
    topErrorTypes: { type: string; count: number }[];
  } {
    const typeCount = new Map<string, number>();
    let criticalCount = 0;

    for (const error of this.errors.values()) {
      const count = typeCount.get(error.type) || 0;
      typeCount.set(error.type, count + error.frequency);

      if (this.isCriticalError(error.type, error.message)) {
        criticalCount += error.frequency;
      }
    }

    const topErrorTypes = Array.from(typeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalErrors: Array.from(this.errors.values()).reduce((sum, e) => sum + e.frequency, 0),
      uniqueErrors: this.errors.size,
      criticalErrors: criticalCount,
      topErrorTypes,
    };
  }

  /**
   * Очистка старых ошибок
   */
  clearOldErrors(hours: number = 24): void {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    for (const [key, error] of this.errors.entries()) {
      if (error.timestamp < cutoff) {
        this.errors.delete(key);
      }
    }
  }

  /**
   * Экспорт диагностики
   */
  exportDiagnostics(): string {
    const analysis = this.analyzePatterns();
    const topErrors = this.getTopErrors(10);
    const recentErrors = this.getRecentErrors(30);

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      analysis,
      topErrors,
      recentErrors,
    }, null, 2);
  }
}

// Export singleton
export const errorDiagnostics = new ErrorDiagnostics();

// Периодическая очистка старых ошибок
setInterval(() => {
  errorDiagnostics.clearOldErrors(24);
}, 60 * 60 * 1000); // Каждый час

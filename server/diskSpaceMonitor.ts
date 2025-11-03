
import { storage } from "./storage";
import { sendTelegramMessage } from "./telegram";
import { isTelegramEnabled } from "./telegramConfig";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface DiskSpaceInfo {
  available: number;
  used: number;
  total: number;
  percentUsed: number;
}

class DiskSpaceMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly MINIMUM_SPACE_GB = 1; // 1 GB minimum
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // Every hour
  private lastAlertTime: number = 0;
  private readonly ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

  async getDiskSpace(): Promise<DiskSpaceInfo> {
    try {
      const { stdout } = await execAsync("df -BG / | tail -1");
      const parts = stdout.trim().split(/\s+/);
      
      const total = parseInt(parts[1].replace('G', ''));
      const used = parseInt(parts[2].replace('G', ''));
      const available = parseInt(parts[3].replace('G', ''));
      const percentUsed = parseInt(parts[4].replace('%', ''));

      return { available, used, total, percentUsed };
    } catch (error) {
      console.error("Failed to get disk space:", error);
      return { available: 0, used: 0, total: 0, percentUsed: 100 };
    }
  }

  async checkDiskSpace(userId: string): Promise<void> {
    const diskInfo = await this.getDiskSpace();

    if (diskInfo.available < this.MINIMUM_SPACE_GB) {
      const now = Date.now();
      
      // Prevent alert spam
      if (now - this.lastAlertTime < this.ALERT_COOLDOWN_MS) {
        return;
      }

      this.lastAlertTime = now;

      const message = `🚨 <b>КРИТИЧЕСКИ МАЛО МЕСТА НА ДИСКЕ!</b>\n\n` +
        `Доступно: ${diskInfo.available} GB\n` +
        `Использовано: ${diskInfo.percentUsed}%\n` +
        `Рекомендуется очистить логи и временные файлы`;

      console.error(message);

      // Log to activity
      await storage.createActivityLog(userId, {
        type: 'system',
        level: 'error',
        message: `Критически мало места на диске: ${diskInfo.available} GB`,
        metadata: diskInfo,
      });

      // Send Telegram alert
      if (isTelegramEnabled()) {
        await sendTelegramMessage(userId, message);
      }
    }
  }

  startMonitoring(userId: string): void {
    if (this.checkInterval) {
      console.log("Disk space monitor already running");
      return;
    }

    console.log("Starting disk space monitor...");

    // Check immediately
    this.checkDiskSpace(userId);

    // Then check periodically
    this.checkInterval = setInterval(() => {
      this.checkDiskSpace(userId);
    }, this.CHECK_INTERVAL_MS);

    console.log("✅ Disk space monitor started");
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log("Disk space monitor stopped");
    }
  }

  isMonitoring(): boolean {
    return this.checkInterval !== null;
  }
}

export const diskSpaceMonitor = new DiskSpaceMonitor();

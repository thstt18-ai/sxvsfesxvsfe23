
import fs from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { storage } from './storage';

const pipe = promisify(pipeline);

export class LogRotationManager {
  private logsDir: string;
  private archiveDir: string;
  private maxDays: number;
  private minDiskSpaceGB: number;

  constructor() {
    this.logsDir = process.env.TRADE_LOGS_DIR || './logs';
    this.archiveDir = path.join(this.logsDir, 'archive');
    this.maxDays = parseInt(process.env.LOG_RETENTION_DAYS || '30');
    this.minDiskSpaceGB = parseFloat(process.env.MIN_DISK_SPACE_GB || '1');
  }

  /**
   * Initialize archive directory
   */
  async initialize(): Promise<void> {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
    console.log('📦 Log rotation manager initialized');
  }

  /**
   * Archive old logs (older than maxDays)
   */
  async archiveOldLogs(): Promise<void> {
    const now = Date.now();
    const maxAge = this.maxDays * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.logsDir);
      
      for (const file of files) {
        if (!file.endsWith('.csv')) continue;

        const filePath = path.join(this.logsDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await this.compressFile(filePath);
        }
      }
    } catch (error: any) {
      console.error('Error archiving logs:', error);
    }
  }

  /**
   * Compress file to gzip
   */
  private async compressFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const date = new Date();
    const archiveName = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.tar.gz`;
    const archivePath = path.join(this.archiveDir, archiveName);

    try {
      const gzip = createGzip();
      const source = fs.createReadStream(filePath);
      const destination = fs.createWriteStream(archivePath, { flags: 'a' });

      await pipe(source, gzip, destination);
      
      // Delete original file after compression
      fs.unlinkSync(filePath);
      
      console.log(`📦 Archived: ${fileName} → ${archiveName}`);
    } catch (error: any) {
      console.error(`Failed to compress ${fileName}:`, error);
    }
  }

  /**
   * Check disk space
   */
  async checkDiskSpace(userId: string): Promise<boolean> {
    try {
      const { execSync } = require('child_process');
      const output = execSync('df -BG . | tail -1').toString();
      const availableGB = parseInt(output.split(/\s+/)[3]);

      if (availableGB < this.minDiskSpaceGB) {
        await storage.createActivityLog(userId, {
          type: 'system',
          level: 'error',
          message: `⚠️ DISK SPACE CRITICAL: Only ${availableGB}GB free (minimum: ${this.minDiskSpaceGB}GB)`,
          metadata: {
            availableGB,
            minRequired: this.minDiskSpaceGB,
          },
        });
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Error checking disk space:', error);
      return true; // Don't block on error
    }
  }

  /**
   * Start periodic rotation (daily at 2 AM)
   */
  startRotation(userId: string): void {
    // Check every hour
    setInterval(async () => {
      const hour = new Date().getHours();
      if (hour === 2) {
        await this.archiveOldLogs();
        await this.checkDiskSpace(userId);
      }
    }, 60 * 60 * 1000);

    console.log('🔄 Log rotation scheduler started (runs daily at 2 AM)');
  }
}

export const logRotationManager = new LogRotationManager();


import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Убедиться, что директория логов существует
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private logToFile(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    const logFile = path.join(LOG_DIR, `app-${new Date().toISOString().split('T')[0]}.log`);

    fs.appendFileSync(logFile, logLine);
  }

  debug(message: string, data?: any) {
    console.log(`[DEBUG] ${message}`, data || '');
    this.logToFile('debug', message, data);
  }

  info(message: string, data?: any) {
    console.log(`[INFO] ${message}`, data || '');
    this.logToFile('info', message, data);
  }

  warn(message: string, data?: any) {
    console.warn(`[WARN] ${message}`, data || '');
    this.logToFile('warn', message, data);
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error || '');
    this.logToFile('error', message, error);
  }
}

export default new Logger();

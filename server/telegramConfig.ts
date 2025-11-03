export interface TelegramConfig {
  enabled: boolean;
  botToken?: string;
  chatId?: string;
}

// Telegram Module Configuration
let telegramEnabled = false; // Отключён по умолчанию (можно включить в UI)

export function isTelegramEnabled(): boolean {
  return telegramEnabled;
}

export function setTelegramEnabled(enabled: boolean): void {
  telegramEnabled = enabled;
  console.log(`Telegram module ${enabled ? 'enabled' : 'disabled'}`);
}

export function getTelegramConfig(): TelegramConfig {
  return {
    enabled: telegramEnabled,
  };
}

// Telegram is DISABLED by default - all operations work without it
export const telegramConfig = {
  enabled: process.env.TELEGRAM_ENABLED === 'true' || false,
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
};
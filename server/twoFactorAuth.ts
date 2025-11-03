
import { storage } from './storage';

interface TwoFactorCode {
  code: string;
  expiresAt: number;
  userId: string;
  operation: string;
}

export class TwoFactorAuth {
  private activeCodes: Map<string, TwoFactorCode> = new Map();
  private readonly CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate 6-digit code for critical operation
   */
  async generateCode(userId: string, operation: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + this.CODE_EXPIRY_MS;

    this.activeCodes.set(userId, {
      code,
      expiresAt,
      userId,
      operation,
    });

    // Log generation
    await storage.createActivityLog(userId, {
      type: 'security',
      level: 'info',
      message: `🔐 2FA code generated for operation: ${operation}`,
      metadata: { operation, expiresAt: new Date(expiresAt).toISOString() },
    });

    // Cleanup expired codes
    this.cleanupExpiredCodes();

    return code;
  }

  /**
   * Verify 2FA code
   */
  async verifyCode(userId: string, inputCode: string): Promise<{ valid: boolean; operation?: string }> {
    const codeData = this.activeCodes.get(userId);

    if (!codeData) {
      return { valid: false };
    }

    if (Date.now() > codeData.expiresAt) {
      this.activeCodes.delete(userId);
      return { valid: false };
    }

    if (codeData.code !== inputCode) {
      return { valid: false };
    }

    // Code is valid, remove it (one-time use)
    this.activeCodes.delete(userId);

    await storage.createActivityLog(userId, {
      type: 'security',
      level: 'success',
      message: `✅ 2FA code verified for operation: ${codeData.operation}`,
      metadata: { operation: codeData.operation },
    });

    return { valid: true, operation: codeData.operation };
  }

  /**
   * Cleanup expired codes
   */
  private cleanupExpiredCodes(): void {
    const now = Date.now();
    for (const [userId, codeData] of this.activeCodes.entries()) {
      if (now > codeData.expiresAt) {
        this.activeCodes.delete(userId);
      }
    }
  }

  /**
   * Check if user has pending 2FA
   */
  hasPendingCode(userId: string): boolean {
    const codeData = this.activeCodes.get(userId);
    if (!codeData) return false;
    if (Date.now() > codeData.expiresAt) {
      this.activeCodes.delete(userId);
      return false;
    }
    return true;
  }
}

export const twoFactorAuth = new TwoFactorAuth();

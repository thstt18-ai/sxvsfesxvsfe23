
import { createClient, RedisClientType } from 'redis';

export interface CachedApproval {
  tokenAddress: string;
  spender: string;
  signature: string;
  deadline: number;
  nonce: number;
}

export class RedisApproveCache {
  private client: RedisClientType | null = null;
  private readonly TTL = 3600; // 1 hour

  async connect(redisUrl: string = 'redis://localhost:6379'): Promise<void> {
    this.client = createClient({ url: redisUrl });
    
    this.client.on('error', (err) => console.error('Redis error:', err));
    
    await this.client.connect();
    console.log('✅ Redis approve cache connected');
  }

  async cacheApproval(
    user: string,
    approval: CachedApproval
  ): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `approve:${user}:${approval.tokenAddress}:${approval.spender}`;
    await this.client.setEx(key, this.TTL, JSON.stringify(approval));
  }

  async getApproval(
    user: string,
    tokenAddress: string,
    spender: string
  ): Promise<CachedApproval | null> {
    if (!this.client) throw new Error('Redis not connected');

    const key = `approve:${user}:${tokenAddress}:${spender}`;
    const cached = await this.client.get(key);
    
    if (!cached) return null;

    const approval: CachedApproval = JSON.parse(cached);
    
    // Check if still valid
    if (approval.deadline < Date.now() / 1000) {
      await this.client.del(key);
      return null;
    }

    return approval;
  }

  async clearUserCache(user: string): Promise<void> {
    if (!this.client) throw new Error('Redis not connected');

    const keys = await this.client.keys(`approve:${user}:*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}

export const redisCache = new RedisApproveCache();

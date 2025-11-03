
export class RateLimiter {
  private requestCounts: Map<string, number[]> = new Map();
  private maxRequestsPerWindow: number;
  private windowMs: number;

  constructor() {
    this.maxRequestsPerWindow = parseInt(process.env.MAX_RPC_REQUESTS_PER_WINDOW || '100');
    this.windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '10000'); // 10 seconds
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(endpoint: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.requestCounts.get(endpoint) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequestsPerWindow) {
      const oldestRequest = validRequests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      
      console.log(`⏸️ Rate limit reached for ${endpoint}, waiting ${Math.ceil(waitTime / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return false;
    }
    
    validRequests.push(now);
    this.requestCounts.set(endpoint, validRequests);
    return true;
  }

  /**
   * Execute request with rate limiting
   */
  async execute<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    await this.checkLimit(endpoint);
    return fn();
  }
}

export const rateLimiter = new RateLimiter();

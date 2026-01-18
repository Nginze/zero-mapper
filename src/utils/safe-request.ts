import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import pLimit from 'p-limit';

type Limit = ReturnType<typeof pLimit>;

interface RateLimiterConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
  concurrency?: number;
}

interface RequestQueueItem {
  config: AxiosRequestConfig;
  resolve: (value: AxiosResponse) => void;
  reject: (error: any) => void;
  retryCount: number;
}

export class SafeRequestManager {
  private limiters: Map<string, Limit> = new Map();
  private rateLimitConfig: Map<string, RateLimiterConfig> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  private minRequestInterval = 100; // Minimum 100ms between requests to same domain

  constructor() {
    // Configure rate limits for different providers
    this.configureRateLimit('graphql.anilist.co', {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      timeout: 10000,
      concurrency: 2 // More conservative for AniList
    });

    this.configureRateLimit('api.myanimelist.net', {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      timeout: 10000,
      concurrency: 1 // Very conservative for MAL
    });

    this.configureRateLimit('api.themoviedb.org', {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 15000,
      timeout: 10000,
      concurrency: 3
    });

    this.configureRateLimit('localhost', {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 10000,
      timeout: 5000,
      concurrency: 5
    });

    // Default configuration for unknown domains
    this.configureRateLimit('default', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 20000,
      timeout: 10000,
      concurrency: 2
    });
  }

  private configureRateLimit(domain: string, config: RateLimiterConfig) {
    this.rateLimitConfig.set(domain, config);
    this.limiters.set(domain, pLimit(config.concurrency || 2));
  }

  private getDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'default';
    }
  }

  private getConfig(domain: string): RateLimiterConfig {
    return this.rateLimitConfig.get(domain) || this.rateLimitConfig.get('default')!;
  }

  private getLimiter(domain: string): Limit {
    return this.limiters.get(domain) || this.limiters.get('default')!;
  }

  private async enforceRateLimit(domain: string) {
    const lastRequest = this.lastRequestTime.get(domain) || 0;
    const timeSinceLastRequest = Date.now() - lastRequest;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }

    this.lastRequestTime.set(domain, Date.now());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(retryCount: number, baseDelay: number, maxDelay: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * baseDelay * 0.5; // Add up to 50% jitter
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private shouldRetry(error: any, retryCount: number, maxRetries: number): boolean {
    if (retryCount >= maxRetries) return false;

    // Always retry on network errors
    if (!error.response) return true;

    const status = error.response?.status;

    // Retry on rate limits and server errors
    if (status === 429 || status === 503 || status === 502 || status === 504) {
      return true;
    }

    // Retry on timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Don't retry on client errors (except 429)
    if (status >= 400 && status < 500) {
      return false;
    }

    // Retry on server errors (5xx)
    if (status >= 500) {
      return true;
    }

    return false;
  }

  private getRetryDelay(error: any, retryCount: number, config: RateLimiterConfig): number {
    // Check for Retry-After header
    const retryAfter = error.response?.headers['retry-after'];
    if (retryAfter) {
      const retryAfterMs = parseInt(retryAfter) * 1000;
      if (!isNaN(retryAfterMs) && retryAfterMs > 0) {
        return Math.min(retryAfterMs, config.maxDelay || 30000);
      }
    }

    // Use exponential backoff
    return this.calculateBackoffDelay(
      retryCount,
      config.baseDelay || 1000,
      config.maxDelay || 30000
    );
  }

  async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const url = config.url || '';
    const domain = this.getDomain(url);
    const rateLimitConfig = this.getConfig(domain);
    const limiter = this.getLimiter(domain);

    return limiter(async () => {
      let retryCount = 0;
      const maxRetries = rateLimitConfig.maxRetries || 3;

      while (true) {
        try {
          // Enforce rate limiting
          await this.enforceRateLimit(domain);

          // Add timeout if not specified
          const requestConfig: AxiosRequestConfig = {
            ...config,
            timeout: config.timeout || rateLimitConfig.timeout || 10000
          };

          const response = await axios(requestConfig);
          return response;
        } catch (error: any) {
          const shouldRetry = this.shouldRetry(error, retryCount, maxRetries);

          if (!shouldRetry) {
            throw error;
          }

          const delay = this.getRetryDelay(error, retryCount, rateLimitConfig);
          const status = error.response?.status || 'network error';

          console.log(
            `⚠️  Request failed (${status}): ${url} - Retry ${retryCount + 1}/${maxRetries} after ${(delay / 1000).toFixed(1)}s`
          );

          await this.delay(delay);
          retryCount++;
        }
      }
    });
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  // Get current stats for monitoring
  getStats() {
    const stats: Record<string, any> = {};

    for (const [domain, limiter] of this.limiters.entries()) {
      stats[domain] = {
        activeCount: limiter.activeCount,
        pendingCount: limiter.pendingCount,
        config: this.rateLimitConfig.get(domain)
      };
    }

    return stats;
  }
}

// Export a singleton instance
export const safeRequest = new SafeRequestManager();

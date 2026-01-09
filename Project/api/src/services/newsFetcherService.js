import axios from "axios";
import SentimentData from "../models/sentimentData.js";

class NewsFetcherService {
  constructor() {
    this.apiKey = process.env.NEWSAPI_KEY;
    this.baseUrl = "https://newsapi.org/v2";
    this.cacheTTL = 4 * 60 * 60 * 1000; // 4 hours
    this.dailyLimit = 100;
    this.requestCount = 0;
    this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    this.resetInterval = null; // Track the interval

    // Start daily reset timer
    this.startDailyReset();
  }

  /**
   * Starts daily counter reset (fixes memory leak)
   */
  startDailyReset() {
    // Clear existing interval if any
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }

    this.resetInterval = setInterval(
      () => {
        const now = Date.now();
        if (now >= this.resetTime) {
          this.requestCount = 0;
          this.resetTime = now + 24 * 60 * 60 * 1000;
          console.log("[NewsAPI] Daily rate limit counter reset");
        }
      },
      60 * 60 * 1000
    );

    // Allow process to exit even if interval is running
    if (this.resetInterval.unref) {
      this.resetInterval.unref();
    }
  }

  destroy() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
      this.resetInterval = null;
    }
  }

  /**
   * FIX: Improved cache checking with better error handling
   */
  async fetchNewsForTicker(ticker, forceRefresh = false) {
    const symbol = ticker.toUpperCase();

    try {
      // Check rate limit first
      if (!this.checkRateLimit()) {
        console.warn("[NewsAPI] Daily rate limit exceeded, using cache");
        const cached = await this.getCachedNews(symbol);
        if (cached) return cached;

        // Return empty result if no cache and rate limited
        return {
          ticker: symbol,
          articles: [],
          calculatedAt: new Date(),
          cached: false,
          rateLimited: true,
        };
      }

      // Check cache unless force refresh
      if (!forceRefresh) {
        const cached = await this.getCachedNews(symbol);
        if (cached && cached.articles && cached.articles.length > 0) {
          console.log(
            `[NewsCache] HIT: ${symbol} (${cached.articles.length} articles)`
          );
          return { ...cached, cached: true };
        }
      }

      console.log(`[NewsCache] MISS: ${symbol} - fetching from API...`);

      // Fetch from API
      const articles = await this.fetchFromAPI(symbol);

      if (!articles || articles.length === 0) {
        console.warn(`[NewsAPI] No articles found for ${symbol}`);
        return {
          ticker: symbol,
          articles: [],
          calculatedAt: new Date(),
          cached: false,
        };
      }

      // Cache and return
      await this.cacheNews(symbol, articles);

      return {
        ticker: symbol,
        articles: articles.map((a) => ({
          title: a.title || "Untitled",
          url: a.url || "",
          publishedAt: new Date(a.publishedAt),
          description: a.description || "",
          source: a.source?.name || "Unknown",
        })),
        calculatedAt: new Date(),
        cached: false,
      };
    } catch (error) {
      console.error(
        `[NewsAPI] Error fetching news for ${symbol}:`,
        error.message
      );

      // Try to return cached data on error
      const cached = await this.getCachedNews(symbol);
      if (cached) {
        console.log(
          `[NewsAPI] Returning stale cache for ${symbol} due to error`
        );
        return { ...cached, cached: true, error: true };
      }

      // Return empty result if everything fails
      return {
        ticker: symbol,
        articles: [],
        calculatedAt: new Date(),
        cached: false,
        error: true,
      };
    }
  }

  /**
   * FIX: Better error handling and validation
   */
  async fetchFromAPI(ticker) {
    if (!this.apiKey) {
      throw new Error("NEWSAPI_KEY not configured");
    }

    try {
      this.requestCount++;

      const searchQuery = `${ticker} stock OR ${ticker} shares`;
      const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const response = await axios.get(`${this.baseUrl}/everything`, {
        params: {
          q: searchQuery,
          from: fromDate,
          sortBy: "publishedAt",
          language: "en",
          pageSize: 10,
          apiKey: this.apiKey,
        },
        timeout: 10000,
        validateStatus: (status) => status < 500, // Accept 4xx as valid response
      });

      // Handle different response scenarios
      if (response.status === 429) {
        throw new Error("NewsAPI rate limit exceeded");
      }

      if (response.status === 401) {
        throw new Error("Invalid NewsAPI key");
      }

      if (response.status >= 400) {
        throw new Error(
          `NewsAPI HTTP ${response.status}: ${response.statusText}`
        );
      }

      const { data } = response;

      if (data.status !== "ok") {
        throw new Error(`NewsAPI error: ${data.message || "Unknown error"}`);
      }

      return data.articles || [];
    } catch (error) {
      // Decrement counter on failure to not waste quota
      if (this.requestCount > 0) {
        this.requestCount--;
      }
      throw error;
    }
  }

  /**
   * FIX: More robust cache retrieval
   */
  async getCachedNews(ticker) {
    try {
      const cached = await SentimentData.findOne({ ticker })
        .sort({ calculatedAt: -1 })
        .lean();

      if (!cached) return null;

      const age = Date.now() - new Date(cached.calculatedAt).getTime();

      // Return cached data if within TTL
      if (age < this.cacheTTL) {
        return {
          ticker: cached.ticker,
          articles: cached.articles || [],
          sentimentScore: cached.sentimentScore,
          calculatedAt: cached.calculatedAt,
        };
      }

      return null;
    } catch (error) {
      console.error(`[NewsCache] DB read error for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * FIX: Better error handling in cache writes
   */
  async cacheNews(ticker, articles) {
    if (!articles || articles.length === 0) {
      return; // Don't cache empty results
    }

    try {
      const articleData = articles.map((a) => ({
        title: a.title || "Untitled",
        url: a.url || "",
        publishedAt: new Date(a.publishedAt || Date.now()),
        sentiment: 0, // Placeholder
      }));

      await SentimentData.findOneAndUpdate(
        { ticker },
        {
          ticker,
          articles: articleData,
          sentimentScore: 0,
          calculatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(
        `[NewsCache] Cached ${articles.length} articles for ${ticker}`
      );
    } catch (error) {
      console.error(`[NewsCache] DB write error for ${ticker}:`, error.message);
      // Don't throw - cache failure shouldn't break the flow
    }
  }

  /**
   * Checks if daily rate limit allows another request
   */
  checkRateLimit() {
    // Auto-reset if 24 hours passed
    if (Date.now() >= this.resetTime) {
      this.requestCount = 0;
      this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    return this.requestCount < this.dailyLimit;
  }

  /**
   * FIX: Better batch processing with progress tracking
   */
  async fetchBatchNews(tickers) {
    const results = {};
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`[NewsAPI] Starting batch fetch for ${tickers.length} tickers`);

    for (const ticker of tickers) {
      // Check rate limit before each request
      if (!this.checkRateLimit()) {
        console.warn(`[NewsAPI] Rate limit reached after ${processed} tickers`);
        skipped = tickers.length - processed;
        break;
      }

      try {
        const news = await this.fetchNewsForTicker(ticker);
        results[ticker] = news;
        processed++;

        // Progress logging every 10 tickers
        if (processed % 10 === 0) {
          console.log(`[NewsAPI] Progress: ${processed}/${tickers.length}`);
        }

        // Delay between requests (respect API fair use)
        if (processed < tickers.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (error) {
        console.error(
          `[NewsAPI] Failed to fetch news for ${ticker}:`,
          error.message
        );
        results[ticker] = {
          ticker,
          articles: [],
          error: true,
          errorMessage: error.message,
        };
        errors++;
      }
    }

    console.log(
      `[NewsAPI] Batch complete: ${processed} processed, ${skipped} skipped, ${errors} errors`
    );
    return { results, processed, skipped, errors };
  }

  /**
   * Gets current rate limit status
   */
  getRateLimitStatus() {
    const remaining = this.dailyLimit - this.requestCount;
    const resetIn = Math.ceil((this.resetTime - Date.now()) / 1000 / 60);

    return {
      dailyLimit: this.dailyLimit,
      used: this.requestCount,
      remaining: Math.max(0, remaining),
      resetInMinutes: Math.max(0, resetIn),
      percentUsed: Math.round((this.requestCount / this.dailyLimit) * 100),
    };
  }

  /**
   * Manually reset rate limit counter (for testing)
   */
  resetRateLimit() {
    this.requestCount = 0;
    this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    console.log("[NewsAPI] Rate limit manually reset");
  }
}

export default new NewsFetcherService();
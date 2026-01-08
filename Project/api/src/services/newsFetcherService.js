import axios from 'axios';
import SentimentData from '../models/sentimentData.js';

class NewsFetcherService {
  constructor() {
    this.apiKey = process.env.NEWSAPI_KEY;
    this.baseUrl = 'https://newsapi.org/v2';
    this.cache = new Map();
    this.cacheTTL = 4 * 60 * 60 * 1000; // 4 hours per PRD
    this.dailyLimit = 100;
    this.requestCount = 0;
    this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
  }

  /**
   * Fetches news articles for a specific ticker
   * Returns cached data if available and not expired
   */
  async fetchNewsForTicker(ticker, forceRefresh = false) {
    const symbol = ticker.toUpperCase();

    // Check rate limit
    if (!this.checkRateLimit()) {
      console.warn('[NewsAPI] Daily rate limit exceeded');
      return this.getCachedNews(symbol);
    }

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await this.getCachedNews(symbol);
      if (cached && cached.articles.length > 0) {
        console.log(`[NewsCache] HIT: ${symbol} (${cached.articles.length} articles)`);
        return cached;
      }
    }

    console.log(`[NewsCache] MISS: ${symbol} - fetching from API...`);

    try {
      const articles = await this.fetchFromAPI(symbol);
      
      if (articles.length === 0) {
        console.warn(`[NewsAPI] No articles found for ${symbol}`);
        return { ticker: symbol, articles: [], calculatedAt: new Date() };
      }

      // Cache the results
      await this.cacheNews(symbol, articles);
      
      return {
        ticker: symbol,
        articles: articles.map(a => ({
          title: a.title,
          url: a.url,
          publishedAt: new Date(a.publishedAt),
          description: a.description || '',
          source: a.source?.name || 'Unknown'
        })),
        calculatedAt: new Date()
      };

    } catch (error) {
      console.error(`[NewsAPI] Error fetching news for ${symbol}:`, error.message);
      
      // Return cached data as fallback
      const cached = await this.getCachedNews(symbol);
      if (cached) {
        console.log(`[NewsAPI] Returning stale cache for ${symbol}`);
        return cached;
      }
      
      throw error;
    }
  }

  /**
   * Fetches articles from NewsAPI
   */
  async fetchFromAPI(ticker) {
    if (!this.apiKey) {
      throw new Error('NEWSAPI_KEY not configured');
    }

    this.requestCount++;

    const searchQuery = `${ticker} stock OR ${ticker} shares`;
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data } = await axios.get(`${this.baseUrl}/everything`, {
      params: {
        q: searchQuery,
        from: fromDate,
        sortBy: 'publishedAt',
        language: 'en',
        pageSize: 10,
        apiKey: this.apiKey
      },
      timeout: 10000
    });

    if (data.status !== 'ok') {
      throw new Error(`NewsAPI error: ${data.message || 'Unknown error'}`);
    }

    return data.articles || [];
  }

  /**
   * Gets cached news from database
   */
  async getCachedNews(ticker) {
    try {
      const cached = await SentimentData.findOne({ ticker })
        .sort({ calculatedAt: -1 })
        .lean();

      if (!cached) return null;

      const age = Date.now() - new Date(cached.calculatedAt).getTime();
      
      if (age < this.cacheTTL) {
        return {
          ticker: cached.ticker,
          articles: cached.articles,
          sentimentScore: cached.sentimentScore,
          calculatedAt: cached.calculatedAt
        };
      }

      return null;
    } catch (error) {
      console.error(`[NewsCache] DB read error for ${ticker}:`, error.message);
      return null;
    }
  }

  /**
   * Caches news articles in database
   */
  async cacheNews(ticker, articles) {
    try {
      // Store articles without sentiment scores initially
      // Sentiment will be calculated by the Python service
      await SentimentData.findOneAndUpdate(
        { ticker },
        {
          ticker,
          articles: articles.map(a => ({
            title: a.title,
            url: a.url,
            publishedAt: new Date(a.publishedAt),
            sentiment: 0 // Placeholder, will be updated by sentiment service
          })),
          sentimentScore: 0,
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`[NewsCache] DB write error for ${ticker}:`, error.message);
    }
  }

  /**
   * Checks if daily rate limit allows another request
   */
  checkRateLimit() {
    // Reset counter if 24 hours have passed
    if (Date.now() > this.resetTime) {
      this.requestCount = 0;
      this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    return this.requestCount < this.dailyLimit;
  }

  /**
   * Fetches news for multiple tickers (batch operation)
   * Respects daily rate limit by processing until limit reached
   */
  async fetchBatchNews(tickers) {
    const results = {};
    let processed = 0;
    let skipped = 0;

    for (const ticker of tickers) {
      if (!this.checkRateLimit()) {
        console.warn(`[NewsAPI] Rate limit reached after ${processed} tickers. Skipping remaining ${tickers.length - processed}.`);
        skipped = tickers.length - processed;
        break;
      }

      try {
        const news = await this.fetchNewsForTicker(ticker);
        results[ticker] = news;
        processed++;

        // Small delay between requests (1 second)
        if (processed < tickers.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (error) {
        console.error(`[NewsAPI] Failed to fetch news for ${ticker}:`, error.message);
        results[ticker] = null;
      }
    }

    console.log(`[NewsAPI] Batch complete: ${processed} processed, ${skipped} skipped`);
    return { results, processed, skipped };
  }

  /**
   * Gets current rate limit status
   */
  getRateLimitStatus() {
    const remaining = this.dailyLimit - this.requestCount;
    const resetIn = Math.ceil((this.resetTime - Date.now()) / 1000 / 60); // minutes

    return {
      dailyLimit: this.dailyLimit,
      used: this.requestCount,
      remaining,
      resetInMinutes: resetIn > 0 ? resetIn : 0
    };
  }
}

export default new NewsFetcherService();
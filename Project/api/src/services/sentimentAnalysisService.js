import axios from 'axios';
import SentimentData from '../models/sentimentData.js';
import newsFetcherService from './newsFetcherService.js';

class SentimentAnalysisService {
  constructor() {
    this.pythonServiceUrl = process.env.PYTHON_SENTIMENT_URL || 'http://localhost:8000';
    this.timeout = 5000; // 5 seconds per PRD
    this.maxRetries = 3;
    this.circuitBreakerThreshold = 10;
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitResetTime = null;
  }

  /**
   * Analyzes sentiment for a specific ticker
   * Fetches news, calls Python service, caches results
   */
  async analyzeTicker(ticker, forceRefresh = false) {
    const symbol = ticker.toUpperCase();

    try {
      // Check if circuit breaker is open
      if (this.isCircuitOpen()) {
        console.warn('[Sentiment] Circuit breaker open, using cached data');
        return this.getCachedSentiment(symbol);
      }

      // Get news articles
      const newsData = await newsFetcherService.fetchNewsForTicker(symbol, forceRefresh);
      
      if (!newsData.articles || newsData.articles.length === 0) {
        console.log(`[Sentiment] No articles for ${symbol}, returning neutral`);
        return {
          ticker: symbol,
          sentimentScore: 0,
          articles: [],
          calculatedAt: new Date()
        };
      }

      // Analyze sentiment for each article
      const articlesWithSentiment = await this.analyzeArticles(newsData.articles);
      
      // Calculate aggregate sentiment score
      const totalScore = articlesWithSentiment.reduce((sum, a) => sum + a.sentiment, 0);
      const avgScore = articlesWithSentiment.length > 0 
        ? totalScore / articlesWithSentiment.length 
        : 0;

      // Save to database
      const sentimentData = await SentimentData.findOneAndUpdate(
        { ticker: symbol },
        {
          ticker: symbol,
          sentimentScore: Math.round(avgScore * 100) / 100,
          articles: articlesWithSentiment.map(a => ({
            title: a.title,
            url: a.url,
            sentiment: Math.round(a.sentiment * 100) / 100,
            publishedAt: a.publishedAt
          })),
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;
      this.circuitOpen = false;

      console.log(`[Sentiment] ✓ ${symbol}: ${avgScore.toFixed(2)} (${articlesWithSentiment.length} articles)`);
      return sentimentData;

    } catch (error) {
      console.error(`[Sentiment] Error analyzing ${symbol}:`, error.message);
      
      // Increment failure counter
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        this.openCircuitBreaker();
      }

      // Return cached data as fallback
      return this.getCachedSentiment(symbol);
    }
  }

  /**
   * Analyzes sentiment for multiple articles using Python service
   */
  async analyzeArticles(articles) {
    const results = [];

    for (const article of articles) {
      try {
        // Use title + description for analysis
        const text = `${article.title}. ${article.description || ''}`.trim();
        
        if (text.length < 10) {
          results.push({ ...article, sentiment: 0 });
          continue;
        }

        const sentiment = await this.callPythonService(text);
        results.push({ ...article, sentiment });

        // Small delay to avoid overwhelming Python service
        await new Promise(r => setTimeout(r, 100));

      } catch (error) {
        console.error('[Sentiment] Article analysis failed:', error.message);
        results.push({ ...article, sentiment: 0 }); // Neutral on error
      }
    }

    return results;
  }

  /**
   * Calls Python FastAPI sentiment endpoint with retry logic
   */
  async callPythonService(text, retries = this.maxRetries) {
    try {
      const response = await axios.post(
        `${this.pythonServiceUrl}/analyze`,
        { text },
        { 
          timeout: this.timeout,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data || typeof response.data.sentiment !== 'number') {
        throw new Error('Invalid response from Python service');
      }

      return response.data.sentiment;

    } catch (error) {
      // Retry with exponential backoff
      if (retries > 0 && error.code === 'ECONNREFUSED') {
        const delay = (this.maxRetries - retries + 1) * 1000; // 1s, 2s, 3s
        console.warn(`[Sentiment] Python service unavailable. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this.callPythonService(text, retries - 1);
      }

      if (error.response?.status === 500) {
        console.error('[Sentiment] Python service error:', error.response.data);
      }

      throw error;
    }
  }

  /**
   * Gets cached sentiment data
   */
  async getCachedSentiment(ticker) {
    try {
      const cached = await SentimentData.findOne({ ticker })
        .sort({ calculatedAt: -1 })
        .lean();

      if (cached) {
        console.log(`[Sentiment] Using cached data for ${ticker}`);
        return cached;
      }

      // Return neutral if no cache exists
      return {
        ticker,
        sentimentScore: 0,
        articles: [],
        calculatedAt: new Date()
      };

    } catch (error) {
      console.error('[Sentiment] Cache read error:', error.message);
      return {
        ticker,
        sentimentScore: 0,
        articles: [],
        calculatedAt: new Date()
      };
    }
  }

  /**
   * Batch analyzes sentiment for multiple tickers
   */
  async analyzeBatchTickers(tickers) {
    const results = {};
    let processed = 0;
    let failed = 0;

    for (const ticker of tickers) {
      try {
        const sentiment = await this.analyzeTicker(ticker);
        results[ticker] = sentiment;
        processed++;

        // Delay between tickers to respect rate limits
        await new Promise(r => setTimeout(r, 2000));

      } catch (error) {
        console.error(`[Sentiment] Failed to analyze ${ticker}:`, error.message);
        results[ticker] = null;
        failed++;
      }
    }

    console.log(`[Sentiment] Batch complete: ${processed} processed, ${failed} failed`);
    return { results, processed, failed };
  }

  /**
   * Circuit breaker pattern implementation
   */
  isCircuitOpen() {
    if (!this.circuitOpen) return false;

    // Check if circuit should be reset (5 minutes per PRD)
    if (Date.now() > this.circuitResetTime) {
      console.log('[Sentiment] Circuit breaker reset - attempting reconnection');
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      return false;
    }

    return true;
  }

  openCircuitBreaker() {
    this.circuitOpen = true;
    this.circuitResetTime = Date.now() + (5 * 60 * 1000); // 5 minutes
    console.error('[Sentiment] ⚠️ Circuit breaker opened - Python service appears down');
  }

  /**
   * Health check for Python service
   */
  async checkPythonServiceHealth() {
    try {
      const response = await axios.get(
        `${this.pythonServiceUrl}/health`,
        { timeout: 3000 }
      );
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets service status for monitoring
   */
  getServiceStatus() {
    return {
      pythonServiceUrl: this.pythonServiceUrl,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      circuitResetTime: this.circuitResetTime 
        ? new Date(this.circuitResetTime).toISOString()
        : null
    };
  }
}

export default new SentimentAnalysisService();
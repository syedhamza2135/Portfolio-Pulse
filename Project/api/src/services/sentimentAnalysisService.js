/**
 * Sentiment Analysis Service
 * 
 * Provides AI-powered sentiment analysis for financial news articles.
 * Integrates with a Python FastAPI service that uses FinBERT model.
 * 
 * Features:
 * - Single ticker sentiment analysis
 * - Batch ticker analysis
 * - Circuit breaker pattern (prevents cascading failures)
 * - Caching with fallback to stale data
 * - Health check monitoring
 * - Automatic retry with exponential backoff
 * 
 * Architecture:
 * 1. Fetches news articles for ticker
 * 2. Sends articles to Python sentiment service
 * 3. Aggregates sentiment scores
 * 4. Caches results in database
 * 
 * @module services/sentimentAnalysisService
 * @requires axios
 * @requires services/newsFetcherService
 * @requires models/sentimentData
 */

import axios from "axios";
import SentimentData from "../models/sentimentData.js";
import newsFetcherService from "./newsFetcherService.js";

/**
 * Sentiment Analysis Service Class
 * 
 * Manages communication with Python sentiment analysis service
 * and implements resilience patterns (circuit breaker, retries, caching).
 */
class SentimentAnalysisService {
  /**
   * Initializes the sentiment analysis service
   * 
   * Sets up configuration for Python service communication and
   * circuit breaker state management.
   */
  constructor() {
    // Python FastAPI service URL
    this.pythonServiceUrl =
      process.env.PYTHON_SENTIMENT_URL || "http://localhost:8000";
    
    // Request timeout (5 seconds)
    this.timeout = 5000;
    
    // Retry configuration
    this.maxRetries = 3;
    
    // Circuit breaker configuration
    this.circuitBreakerThreshold = 10;  // Open circuit after 10 failures
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitResetTime = null;
    this.circuitResetTimer = null;
    
    // Health check caching
    this.lastHealthCheck = null;
    this.healthCheckInterval = 30000; // Cache health check for 30 seconds
  }

  /**
   * Analyzes sentiment for a specific ticker
   * 
   * Process:
   * 1. Checks circuit breaker (uses cache if circuit is open)
   * 2. Fetches news articles for the ticker
   * 3. Analyzes each article's sentiment via Python service
   * 4. Calculates aggregate sentiment score
   * 5. Caches results in database
   * 
   * Resilience:
   * - Circuit breaker prevents overwhelming failing service
   * - Falls back to cached data on errors
   * - Returns neutral sentiment if no articles found
   * 
   * @async
   * @function analyzeTicker
   * @param {string} ticker - Ticker symbol to analyze
   * @param {boolean} [forceRefresh=false] - Force refresh even if cache exists
   * 
   * @returns {Promise<Object>} Sentiment analysis results
   * @returns {string} return.ticker - Ticker symbol
   * @returns {number} return.sentimentScore - Aggregate sentiment (-1 to +1)
   * @returns {Array} return.articles - Articles with individual sentiment scores
   * @returns {Date} return.calculatedAt - When analysis was performed
   * @returns {string} return.status - Status: 'success', 'no_articles', 'analysis_failed', 'error', 'cached'
   * 
   * @throws {Error} If critical error occurs (circuit breaker will catch most errors)
   */
  async analyzeTicker(ticker, forceRefresh = false) {
    const symbol = ticker.toUpperCase();

    try {
      // Check circuit breaker
      if (this.isCircuitOpen()) {
        console.warn("[Sentiment] Circuit breaker open, using cached data");
        return await this.getCachedSentiment(symbol);
      }

      // Get news articles
      const newsData = await newsFetcherService.fetchNewsForTicker(
        symbol,
        forceRefresh
      );

      // Handle empty or error results
      if (!newsData || !newsData.articles || newsData.articles.length === 0) {
        console.log(`[Sentiment] No articles for ${symbol}, returning neutral`);

        // Check if we have old cached data
        const cached = await this.getCachedSentiment(symbol);
        if (cached && cached.articles && cached.articles.length > 0) {
          console.log(`[Sentiment] Using old cached data for ${symbol}`);
          return cached;
        }

        return {
          ticker: symbol,
          sentimentScore: 0,
          articles: [],
          calculatedAt: new Date(),
          status: "no_articles",
        };
      }

      // Analyze sentiment for each article
      const articlesWithSentiment = await this.analyzeArticles(
        newsData.articles
      );

      // Calculate aggregate sentiment
      const validArticles = articlesWithSentiment.filter(
        (a) => a.sentiment !== undefined
      );

      if (validArticles.length === 0) {
        console.warn(`[Sentiment] No valid sentiment scores for ${symbol}`);
        return {
          ticker: symbol,
          sentimentScore: 0,
          articles: articlesWithSentiment,
          calculatedAt: new Date(),
          status: "analysis_failed",
        };
      }

      const totalScore = validArticles.reduce((sum, a) => sum + a.sentiment, 0);
      const avgScore = totalScore / validArticles.length;

      // Save to database
      const sentimentData = await SentimentData.findOneAndUpdate(
        { ticker: symbol },
        {
          ticker: symbol,
          sentimentScore: Math.round(avgScore * 100) / 100,
          articles: articlesWithSentiment.map((a) => ({
            title: a.title,
            url: a.url,
            sentiment:
              a.sentiment !== undefined
                ? Math.round(a.sentiment * 100) / 100
                : 0,
            publishedAt: a.publishedAt,
          })),
          calculatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;
      this.circuitOpen = false;

      console.log(
        `[Sentiment] ✓ ${symbol}: ${avgScore.toFixed(2)} (${validArticles.length}/${articlesWithSentiment.length} articles)`
      );

      return {
        ...sentimentData.toObject(),
        status: "success",
      };
    } catch (error) {
      console.error(`[Sentiment] Error analyzing ${symbol}:`, error.message);

      // Increment failure counter
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        this.openCircuitBreaker();
      }

      // Return cached data as fallback
      const cached = await this.getCachedSentiment(symbol);
      return {
        ...cached,
        status: "error",
        error: error.message,
      };
    }
  }

  /**
   * Analyzes sentiment for multiple articles in batches
   * 
   * Processes articles in batches to avoid overwhelming the Python service.
   * Uses Promise.allSettled to ensure partial failures don't stop processing.
   * 
   * @async
   * @function analyzeArticles
   * @param {Array<Object>} articles - Array of news articles to analyze
   * 
   * @returns {Promise<Array<Object>>} Articles with sentiment scores added
   * @returns {number} return[].sentiment - Sentiment score for article (-1 to +1)
   * @returns {boolean} [return[].error] - True if analysis failed for this article
   */
  async analyzeArticles(articles) {
    if (!articles || articles.length === 0) {
      return [];
    }

    const results = [];
    const batchSize = 5; // Process 5 articles at a time

    // Process in batches to avoid overwhelming Python service
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((article) => this.analyzeArticle(article))
      );

      batchResults.forEach((result, index) => {
        const article = batch[index];

        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          console.error(
            `[Sentiment] Failed to analyze article: ${article.title}`,
            result.reason?.message
          );
          results.push({
            ...article,
            sentiment: 0,
            error: true,
          });
        }
      });

      // Delay between batches
      if (i + batchSize < articles.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return results;
  }

  /**
   * Analyzes sentiment for a single article
   * 
   * Combines article title and description for better context.
   * Sends text to Python service for AI-powered sentiment analysis.
   * 
   * @async
   * @function analyzeArticle
   * @param {Object} article - Article object with title and description
   * @param {string} article.title - Article title
   * @param {string} [article.description] - Article description
   * 
   * @returns {Promise<Object>} Article with sentiment score added
   * @returns {number} return.sentiment - Sentiment score (-1 to +1)
   * @returns {boolean} [return.error] - True if analysis failed
   */
  async analyzeArticle(article) {
    try {
      // Validate article data
      if (!article || !article.title) {
        return { ...article, sentiment: 0, error: true };
      }

      // Combine title and description for better context
      const text =
        `${article.title}${article.description ? ". " + article.description : ""}`.trim();

      if (text.length < 10) {
        return { ...article, sentiment: 0, error: true };
      }

      // Call Python service
      const sentiment = await this.callPythonService(text);

      return {
        ...article,
        sentiment: Math.round(sentiment * 100) / 100,
      };
    } catch (error) {
      console.error("[Sentiment] Article analysis error:", error.message);
      return { ...article, sentiment: 0, error: true };
    }
  }

  /**
   * Calls Python sentiment analysis service
   * 
   * Sends text to Python FastAPI service for sentiment analysis.
   * Implements retry logic with exponential backoff for transient failures.
   * 
   * @async
   * @function callPythonService
   * @param {string} text - Text to analyze (max 2000 characters)
   * @param {number} [retries=3] - Number of retry attempts remaining
   * 
   * @returns {Promise<number>} Sentiment score (-1 to +1)
   * @throws {Error} If service is unavailable or returns invalid response
   */
  async callPythonService(text, retries = this.maxRetries) {
    try {
      // Check if service is healthy before calling
      if (!(await this.isServiceHealthy())) {
        throw new Error("Python service is not healthy");
      }

      const response = await axios.post(
        `${this.pythonServiceUrl}/analyze`,
        { text: text.substring(0, 2000) },
        {
          timeout: this.timeout,
          headers: { "Content-Type": "application/json" },
          validateStatus: (status) => status < 500,
        }
      );

      // Handle different status codes
      if (response.status === 503) {
        throw new Error("Python service not ready");
      }

      if (response.status >= 400) {
        throw new Error(`Python service HTTP ${response.status}`);
      }

      if (!response.data || typeof response.data.sentiment !== "number") {
        throw new Error("Invalid response from Python service");
      }

      return response.data.sentiment;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        throw new Error("Python service connection refused - is it running?");
      }
      if (error.code === "ETIMEDOUT") {
        throw new Error(
          "Python service timeout - check network or service load"
        );
      }
      if (error.code === "ENOTFOUND") {
        throw new Error(
          `Python service DNS lookup failed: ${this.pythonServiceUrl}`
        );
      }

      // Retry with exponential backoff
      if (retries > 0 && error.message.includes("not ready")) {
        const delay = (this.maxRetries - retries + 1) * 1000;
        console.warn(
          `[Sentiment] Retrying in ${delay}ms (${retries} attempts left)...`
        );
        await new Promise((r) => setTimeout(r, delay));
        return this.callPythonService(text, retries - 1);
      }

      throw error;
    }
  }

  /**
   * Checks if Python service is healthy (with caching)
   * 
   * Caches health check results for 30 seconds to avoid redundant requests.
   * 
   * @async
   * @function isServiceHealthy
   * 
   * @returns {Promise<boolean>} True if service is healthy and ready
   */
  async isServiceHealthy() {
    const now = Date.now();

    // Use cached health status if recent
    if (
      this.lastHealthCheck &&
      now - this.lastHealthCheck.timestamp < this.healthCheckInterval
    ) {
      return this.lastHealthCheck.healthy;
    }

    // Perform new health check
    const healthy = await this.checkPythonServiceHealth();
    this.lastHealthCheck = {
      healthy,
      timestamp: now,
    };

    return healthy;
  }

  /**
   * Retrieves cached sentiment data from database
   * 
   * Returns the most recent sentiment analysis for a ticker.
   * Used as fallback when service is unavailable or for performance.
   * 
   * @async
   * @function getCachedSentiment
   * @param {string} ticker - Ticker symbol to get cached data for
   * 
   * @returns {Promise<Object>} Cached sentiment data or default neutral sentiment
   */
  async getCachedSentiment(ticker) {
    try {
      const cached = await SentimentData.findOne({ ticker })
        .sort({ calculatedAt: -1 })
        .lean();

      if (cached) {
        console.log(`[Sentiment] Using cached data for ${ticker}`);
        return {
          ...cached,
          cached: true,
        };
      }

      return {
        ticker,
        sentimentScore: 0,
        articles: [],
        calculatedAt: new Date(),
        cached: false,
      };
    } catch (error) {
      console.error("[Sentiment] Cache read error:", error.message);
      return {
        ticker,
        sentimentScore: 0,
        articles: [],
        calculatedAt: new Date(),
        error: true,
      };
    }
  }

  /**
   * Analyzes sentiment for multiple tickers in batch
   * 
   * Processes tickers sequentially with delays to respect rate limits.
   * Provides progress logging and error tracking.
   * 
   * @async
   * @function analyzeBatchTickers
   * @param {Array<string>} tickers - Array of ticker symbols to analyze
   * 
   * @returns {Promise<Object>} Batch analysis results
   * @returns {Object} return.results - Map of ticker to sentiment results
   * @returns {number} return.processed - Number of successfully processed tickers
   * @returns {number} return.failed - Number of failed analyses
   */
  async analyzeBatchTickers(tickers) {
    const results = {};
    let processed = 0;
    let failed = 0;

    console.log(
      `[Sentiment] Starting batch analysis for ${tickers.length} tickers`
    );

    for (const ticker of tickers) {
      try {
        const sentiment = await this.analyzeTicker(ticker);
        results[ticker] = sentiment;
        processed++;

        // Progress logging
        if (processed % 5 === 0) {
          console.log(`[Sentiment] Progress: ${processed}/${tickers.length}`);
        }

        // Delay between tickers
        await new Promise((r) => setTimeout(r, 2000));
      } catch (error) {
        console.error(
          `[Sentiment] Failed to analyze ${ticker}:`,
          error.message
        );
        results[ticker] = {
          ticker,
          error: true,
          errorMessage: error.message,
        };
        failed++;
      }
    }

    console.log(
      `[Sentiment] Batch complete: ${processed} processed, ${failed} failed`
    );
    return { results, processed, failed };
  }

  /**
   * Opens the circuit breaker
   * 
   * Circuit breaker pattern: After threshold failures, stop making requests
   * to the Python service and use cached data instead. Auto-resets after 5 minutes.
   * 
   * This prevents cascading failures and overwhelming a failing service.
   * 
   * @function openCircuitBreaker
   */
  openCircuitBreaker() {
    this.circuitOpen = true;
    this.circuitResetTime = Date.now() + 5 * 60 * 1000;
    console.error(
      "[Sentiment] ⚠️ Circuit breaker OPENED - Python service appears down"
    );

    // Auto-reset with setTimeout
    if (this.circuitResetTimer) {
      clearTimeout(this.circuitResetTimer);
    }

    this.circuitResetTimer = setTimeout(
      () => {
        console.log("[Sentiment] Circuit breaker auto-reset (timer)");
        this.circuitOpen = false;
        this.consecutiveFailures = 0;
        this.circuitResetTimer = null;
      },
      5 * 60 * 1000
    );

    // Allow process to exit
    if (this.circuitResetTimer.unref) {
      this.circuitResetTimer.unref();
    }
  }

  isCircuitOpen() {
    if (!this.circuitOpen) return false;

    // Fallback check (belt and suspenders)
    if (Date.now() >= this.circuitResetTime) {
      console.log("[Sentiment] Circuit breaker auto-reset (fallback)");
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      if (this.circuitResetTimer) {
        clearTimeout(this.circuitResetTimer);
        this.circuitResetTimer = null;
      }
      return false;
    }

    return true;
  }

  destroy() {
    if (this.circuitResetTimer) {
      clearTimeout(this.circuitResetTimer);
      this.circuitResetTimer = null;
    }
  }

  /**
   * Performs health check on Python sentiment service
   * 
   * Calls the /health endpoint of the Python service to verify it's operational.
   * 
   * @async
   * @function checkPythonServiceHealth
   * 
   * @returns {Promise<boolean>} True if service is healthy and model is loaded
   */
  async checkPythonServiceHealth() {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, {
        timeout: 3000,
        validateStatus: (status) => status === 200,
      });

      return (
        response.data?.status === "healthy" ||
        response.data?.model_loaded === true
      );
    } catch (error) {
      console.warn("[Sentiment] Health check failed:", error.message);
      return false;
    }
  }

  /**
   * Gets current service status for monitoring
   * 
   * Returns circuit breaker state and health check information.
   * Useful for monitoring dashboards and debugging.
   * 
   * @function getServiceStatus
   * 
   * @returns {Object} Service status information
   * @returns {string} return.pythonServiceUrl - Python service URL
   * @returns {boolean} return.circuitOpen - Whether circuit breaker is open
   * @returns {number} return.consecutiveFailures - Number of consecutive failures
   * @returns {string|null} return.circuitResetTime - When circuit will auto-reset
   * @returns {Object|null} return.lastHealthCheck - Last health check result
   */
  getServiceStatus() {
    return {
      pythonServiceUrl: this.pythonServiceUrl,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      circuitResetTime: this.circuitResetTime
        ? new Date(this.circuitResetTime).toISOString()
        : null,
      lastHealthCheck: this.lastHealthCheck
        ? {
            healthy: this.lastHealthCheck.healthy,
            timestamp: new Date(this.lastHealthCheck.timestamp).toISOString(),
          }
        : null,
    };
  }

  /**
   * Manually resets the circuit breaker
   * 
   * Useful for testing or when service issues are resolved.
   * 
   * @function resetCircuitBreaker
   */
  resetCircuitBreaker() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.circuitResetTime = null;
    console.log("[Sentiment] Circuit breaker manually reset");
  }
}

export default new SentimentAnalysisService();
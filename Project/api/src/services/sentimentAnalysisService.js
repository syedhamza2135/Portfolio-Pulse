import axios from "axios";
import SentimentData from "../models/sentimentData.js";
import newsFetcherService from "./newsFetcherService.js";

class SentimentAnalysisService {
  constructor() {
    this.pythonServiceUrl =
      process.env.PYTHON_SENTIMENT_URL || "http://localhost:8000";
    this.timeout = 5000;
    this.maxRetries = 3;
    this.circuitBreakerThreshold = 10;
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitResetTime = null;
    this.circuitResetTimer = null;
    this.lastHealthCheck = null;
    this.healthCheckInterval = 30000; // 30 seconds
  }

  /**
   * FIX: Improved sentiment analysis with better error recovery
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
   * FIX: Better article analysis with batch processing
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
   * FIX: Improved single article analysis
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
   * FIX: Improved Python service communication
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
   * FIX: Cached health check to avoid redundant requests
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
   * Gets cached sentiment data
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
   * FIX: Better batch processing with rate limiting
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
   * Circuit breaker implementation
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
   * Health check for Python service
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
   * Gets service status for monitoring
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
   * Manual circuit breaker reset (for admin/testing)
   */
  resetCircuitBreaker() {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.circuitResetTime = null;
    console.log("[Sentiment] Circuit breaker manually reset");
  }
}

export default new SentimentAnalysisService();
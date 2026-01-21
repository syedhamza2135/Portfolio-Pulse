/**
 * Price Fetcher Service
 *
 * Fetches current market prices for stocks and cryptocurrencies.
 *
 * Features:
 * - Multi-layer caching (in-memory + database)
 * - Support for stocks (Alpha Vantage) and crypto (CoinGecko)
 * - Batch price fetching for efficiency
 * - Rate limit handling and retry logic
 * - Automatic cache cleanup
 *
 * Caching Strategy:
 * - In-memory cache: Fastest, 5-minute TTL
 * - Database cache: Persistent, 5-minute TTL
 * - Cache checked before API calls to minimize external requests
 *
 * @module services/priceFetcherService
 * @requires axios
 * @requires models/priceHistory
 */

import axios from "axios";
import PriceHistory from "../models/priceHistory.js";

/**
 * Custom Error: Price not found for ticker
 *
 * Thrown when price data is unavailable for a ticker symbol.
 */
export class PriceNotFoundError extends Error {
  constructor(ticker) {
    super(`Price not found for ${ticker}`);
    this.name = "PriceNotFoundError";
    this.ticker = ticker;
  }
}

/**
 * Custom Error: API rate limit reached
 *
 * Thrown when external API rate limit is exceeded.
 */
export class RateLimitError extends Error {
  constructor(message = "API limit reached") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Price Fetcher Service Class
 *
 * Manages price fetching with caching and rate limit handling.
 */
class PriceFetcherService {
  /**
   * Initializes the price fetcher service
   *
   * Sets up caching, rate limiting, and crypto ticker mapping.
   */
  constructor() {
    // In-memory cache for fast lookups
    this.cache = new Map();

    // Cache TTL: 5 minutes (aligns with PRD requirements)
    this.cacheTTL = 5 * 60 * 1000;

    // Rate limit delay for Alpha Vantage (1 call per 15 seconds)
    this.rateLimitDelay = 15000;

    // Interval tracker for cleanup
    this.cleanupInterval = null;

    // Crypto ticker to CoinGecko ID mapping
    // Maps common crypto tickers to CoinGecko API IDs
    this.cryptoMapping = {
      BTC: "bitcoin",
      ETH: "ethereum",
      BNB: "binancecoin",
      USDT: "tether",
      USDC: "usd-coin",
      XRP: "ripple",
      SOL: "solana",
      DOGE: "dogecoin",
      ADA: "cardano",
      AVAX: "avalanche-2",
      MATIC: "matic-network",
      DOT: "polkadot",
    };

    this.startCacheCleanup();
  }

  /**
   * Fetches current price for a ticker
   *
   * Process:
   * 1. Checks in-memory cache
   * 2. Checks database cache
   * 3. Fetches from appropriate API if not cached
   * 4. Caches result in both memory and database
   *
   * @async
   * @function fetchPrice
   * @param {string} ticker - Ticker symbol (e.g., 'AAPL', 'BTC')
   * @param {string} assetType - Asset type: 'stock', 'crypto', or 'etf'
   *
   * @returns {Promise<number>} Current market price
   * @throws {PriceNotFoundError} If price not found for ticker
   * @throws {RateLimitError} If API rate limit reached
   */
  async fetchPrice(ticker, assetType) {
    const symbol = ticker.toUpperCase();

    // Check cache first
    const cached = await this.getCachedPrice(symbol);
    if (cached !== null) {
      console.log(`[PriceCache] HIT: ${symbol} = $${cached}`);
      return cached;
    }

    console.log(`[PriceCache] MISS: ${symbol} - fetching from API...`);

    // Fetch from appropriate API
    const price =
      assetType === "crypto"
        ? await this.fetchCryptoPrice(symbol)
        : await this.fetchStockPrice(symbol);

    if (!price || price <= 0) {
      throw new PriceNotFoundError(symbol);
    }

    // Cache the result
    await this.cachePrice(symbol, price, assetType);
    return price;
  }

  /**
   * Fetches stock price from Alpha Vantage API
   *
   * Uses GLOBAL_QUOTE endpoint to get real-time stock price.
   * Implements retry logic with exponential backoff for rate limits.
   *
   * @async
   * @function fetchStockPrice
   * @param {string} ticker - Stock ticker symbol
   * @param {number} [retries=2] - Number of retry attempts remaining
   *
   * @returns {Promise<number>} Stock price
   * @throws {RateLimitError} If rate limit reached after retries
   * @throws {PriceNotFoundError} If ticker not found
   */
  async fetchStockPrice(ticker, retries = 2) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error("ALPHA_VANTAGE_API_KEY not configured");
    }

    try {
      const { data } = await axios.get("https://www.alphavantage.co/query", {
        params: {
          function: "GLOBAL_QUOTE",
          symbol: ticker,
          apikey: apiKey,
        },
        timeout: 10000,
      });

      // Check for rate limit errors
      if (data.Note || (typeof data.Information === 'string' && data.Information.includes("rate limit"))) {
        throw new RateLimitError("Alpha Vantage rate limit reached");
      }

      if (data["Error Message"]) {
        throw new PriceNotFoundError(ticker);
      }

      const price = parseFloat(data["Global Quote"]?.["05. price"]);

      if (isNaN(price) || !price) {
        throw new PriceNotFoundError(ticker);
      }

      return price;
    } catch (error) {
      // Retry on rate limit with exponential backoff
      if (error instanceof RateLimitError && retries > 0) {
        const delay = (3 - retries) * 5000; // 5s, 10s
        console.warn(`[AlphaVantage] Rate limited. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchStockPrice(ticker, retries - 1);
      }

      if (
        error instanceof RateLimitError ||
        error instanceof PriceNotFoundError
      ) {
        throw error;
      }

      throw new Error(`Stock fetch failed for ${ticker}: ${error.message}`);
    }
  }

  /**
   * Fetches cryptocurrency price from CoinGecko API
   *
   * Maps ticker to CoinGecko ID and fetches USD price.
   *
   * @async
   * @function fetchCryptoPrice
   * @param {string} ticker - Crypto ticker symbol (e.g., 'BTC', 'ETH')
   *
   * @returns {Promise<number>} Cryptocurrency price in USD
   * @throws {PriceNotFoundError} If ticker not found in CoinGecko
   * @throws {RateLimitError} If CoinGecko rate limit reached
   */
  async fetchCryptoPrice(ticker) {
    const coinId = this.cryptoMapping[ticker] || ticker.toLowerCase();

    try {
      const { data } = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price",
        {
          params: { ids: coinId, vs_currencies: "usd" },
          timeout: 8000,
        }
      );

      const price = data[coinId]?.usd;

      if (!price) {
        throw new PriceNotFoundError(ticker);
      }

      return price;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new RateLimitError("CoinGecko rate limit reached");
      }

      if (error instanceof PriceNotFoundError) {
        throw error;
      }

      throw new Error(`Crypto fetch failed for ${ticker}: ${error.message}`);
    }
  }

  /**
   * Fetches prices for multiple tickers efficiently
   *
   * Optimization strategy:
   * 1. Checks cache for all tickers first
   * 2. Only fetches uncached tickers from API
   * 3. Batches crypto requests together (CoinGecko supports bulk)
   * 4. Processes stocks sequentially (Alpha Vantage rate limits)
   *
   * @async
   * @function fetchBatchPrices
   * @param {Array<Object>} tickers - Array of {ticker, assetType} objects
   *
   * @returns {Promise<Object>} Map of ticker to price
   * @returns {number|null} return[ticker] - Price or null if not found
   */
  async fetchBatchPrices(tickers) {
    const results = {};
    const toFetch = { stocks: [], cryptos: [] };

    // STEP 1: Check cache for ALL tickers first
    for (const t of tickers) {
      const cached = await this.getCachedPrice(t.ticker);
      if (cached !== null) {
        results[t.ticker] = cached;
      } else {
        // Separate uncached by type
        if (t.assetType === "crypto") {
          toFetch.cryptos.push(t);
        } else {
          toFetch.stocks.push(t);
        }
      }
    }

    console.log(
      `[Batch] Cached: ${Object.keys(results).length}, Fetching: ${toFetch.stocks.length} stocks, ${toFetch.cryptos.length} cryptos`
    );

    // STEP 2: Fetch stocks sequentially (rate limit constraint)
    for (const [index, stock] of toFetch.stocks.entries()) {
      try {
        const price = await this.fetchStockPrice(stock.ticker);
        results[stock.ticker] = price;
        await this.cachePrice(stock.ticker, price, stock.assetType);

        // Rate limit delay (skip on last item)
        if (index < toFetch.stocks.length - 1) {
          await new Promise((r) => setTimeout(r, this.rateLimitDelay));
        }
      } catch (error) {
        console.error(
          `[Batch] Failed to fetch ${stock.ticker}:`,
          error.message
        );
        results[stock.ticker] = null;
      }
    }

    // STEP 3: Batch fetch cryptos (CoinGecko supports bulk)
    if (toFetch.cryptos.length > 0) {
      const ids = toFetch.cryptos
        .map((c) => this.cryptoMapping[c.ticker] || c.ticker.toLowerCase())
        .join(",");

      try {
        const { data } = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price",
          {
            params: { ids, vs_currencies: "usd" },
            timeout: 10000,
          }
        );

        // Map results back to tickers
        for (const crypto of toFetch.cryptos) {
          const coinId =
            this.cryptoMapping[crypto.ticker] || crypto.ticker.toLowerCase();
          const price = data[coinId]?.usd;

          if (price) {
            results[crypto.ticker] = price;
            await this.cachePrice(crypto.ticker, price, crypto.assetType);
          } else {
            console.warn(`[Batch] Crypto price not found: ${crypto.ticker}`);
            results[crypto.ticker] = null;
          }
        }
      } catch (error) {
        console.error("[Batch] Crypto bulk fetch failed:", error.message);

        // Set null for all failed cryptos
        for (const crypto of toFetch.cryptos) {
          if (results[crypto.ticker] === undefined) {
            results[crypto.ticker] = null;
          }
        }
      }
    }

    return results;
  }

  /**
   * Retrieves cached price from memory or database
   *
   * Checks in-memory cache first (fastest), then database cache.
   * Returns null if price not found or cache expired.
   *
   * @async
   * @function getCachedPrice
   * @param {string} ticker - Ticker symbol to get cached price for
   *
   * @returns {Promise<number|null>} Cached price or null if not found/expired
   */
  async getCachedPrice(ticker) {
    const symbol = ticker.toUpperCase();

    // Check in-memory cache first (fastest)
    const memCache = this.cache.get(symbol);
    if (memCache && Date.now() - memCache.timestamp < this.cacheTTL) {
      return memCache.price;
    }

    // Check database cache (slower but persistent)
    try {
      const dbCache = await PriceHistory.findOne({ ticker: symbol }).lean();

      if (dbCache) {
        const age = Date.now() - new Date(dbCache.fetchedAt).getTime();

        if (age < this.cacheTTL) {
          // Refresh in-memory cache
          this.cache.set(symbol, {
            price: dbCache.price,
            timestamp: Date.now(),
          });
          return dbCache.price;
        }
      }
    } catch (error) {
      console.error(`[Cache] DB read error for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Caches price in both memory and database
   *
   * Stores price in:
   * - In-memory Map (fast access)
   * - Database (persistent, survives restarts)
   *
   * Database write is non-blocking - failures don't break the request.
   *
   * @async
   * @function cachePrice
   * @param {string} ticker - Ticker symbol
   * @param {number} price - Price to cache
   * @param {string} assetType - Asset type (for database storage)
   */
  async cachePrice(ticker, price, assetType) {
    const symbol = ticker.toUpperCase();

    // In-memory cache (immediate)
    this.cache.set(symbol, { price, timestamp: Date.now() });

    // Database cache (persistent, non-blocking)
    try {
      await PriceHistory.findOneAndUpdate(
        { ticker: symbol },
        {
          ticker: symbol,
          price,
          assetType,
          fetchedAt: new Date(),
          source: "api",
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`[Cache] DB write error for ${symbol}:`, error.message);
      // Don't throw - cache write failure shouldn't break the request
    }
  }

  /**
   * Starts automatic cache cleanup
   *
   * Removes expired entries from in-memory cache periodically.
   * Prevents memory leaks from stale cache entries.
   *
   * @function startCacheCleanup
   */
  startCacheCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(
      () => {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, value] of this.cache.entries()) {
          if (now - value.timestamp > this.cacheTTL) {
            this.cache.delete(key);
            cleaned++;
          }
        }

        if (cleaned > 0) {
          console.log(`[Cache] Cleaned ${cleaned} expired entries`);
        }
      },
      15 * 60 * 1000
    ); // 15 minutes
  }

  /**
   * Graceful shutdown handler
   *
   * Cleans up intervals and clears cache.
   * Should be called during application shutdown.
   *
   * @function destroy
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    console.log("✓ PriceFetcherService destroyed");
  }
}

export default new PriceFetcherService();
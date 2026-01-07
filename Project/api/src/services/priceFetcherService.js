import axios from 'axios';
import PriceCache from '../models/priceCache.js';

export class PriceNotFoundError extends Error {
  constructor(ticker) {
    super(`Price not found for ${ticker}`);
    this.name = 'PriceNotFoundError';
    this.ticker = ticker;
  }
}

export class RateLimitError extends Error {
  constructor(message = 'API limit reached') {
    super(message);
    this.name = 'RateLimitError';
  }
}

class PriceFetcherService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes (align with PRD)
    this.rateLimitDelay = 15000; // Alpha Vantage: 1 call per 15s
    this.cleanupInterval = null; // Track interval for cleanup
    
    this.cryptoMapping = {
      BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
      USDT: 'tether', USDC: 'usd-coin', XRP: 'ripple',
      SOL: 'solana', DOGE: 'dogecoin', ADA: 'cardano',
      AVAX: 'avalanche-2', MATIC: 'matic-network', DOT: 'polkadot'
    };

    this.startCacheCleanup();
  }

  /**
   * Fetches a single ticker price (stocks or crypto)
   * Checks cache first, then fetches from API if needed
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
    const price = assetType === 'crypto' 
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
   * Fetches stock price from Alpha Vantage
   * Includes retry logic for rate limits
   */
  async fetchStockPrice(ticker, retries = 2) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }

    try {
      const { data } = await axios.get('https://www.alphavantage.co/query', {
        params: { 
          function: 'GLOBAL_QUOTE', 
          symbol: ticker, 
          apikey: apiKey 
        },
        timeout: 10000
      });

      // FIX: Check for all error types
      if (data.Note || data.Information || data['Information']) {
        throw new RateLimitError('Alpha Vantage rate limit reached');
      }

      if (data['Error Message']) {
        throw new PriceNotFoundError(ticker);
      }

      const price = parseFloat(data['Global Quote']?.['05. price']);
      
      if (isNaN(price) || !price) {
        throw new PriceNotFoundError(ticker);
      }
      
      return price;

    } catch (error) {
      // Retry on rate limit with exponential backoff
      if (error instanceof RateLimitError && retries > 0) {
        const delay = (3 - retries) * 5000; // 5s, 10s
        console.warn(`[AlphaVantage] Rate limited. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return this.fetchStockPrice(ticker, retries - 1);
      }

      if (error instanceof RateLimitError || error instanceof PriceNotFoundError) {
        throw error;
      }

      throw new Error(`Stock fetch failed for ${ticker}: ${error.message}`);
    }
  }

  /**
   * Fetches crypto price from CoinGecko
   */
  async fetchCryptoPrice(ticker) {
    const coinId = this.cryptoMapping[ticker] || ticker.toLowerCase();
    
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: coinId, vs_currencies: 'usd' },
        timeout: 8000
      });

      const price = data[coinId]?.usd;
      
      if (!price) {
        throw new PriceNotFoundError(ticker);
      }

      return price;

    } catch (error) {
      if (error.response?.status === 429) {
        throw new RateLimitError('CoinGecko rate limit reached');
      }

      if (error instanceof PriceNotFoundError) {
        throw error;
      }

      throw new Error(`Crypto fetch failed for ${ticker}: ${error.message}`);
    }
  }

  /**
   * FIX: Optimized batch fetching
   * 1. Check all caches first
   * 2. Only fetch uncached tickers
   * 3. Batch cryptos together
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
        if (t.assetType === 'crypto') {
          toFetch.cryptos.push(t);
        } else {
          toFetch.stocks.push(t);
        }
      }
    }

    console.log(`[Batch] Cached: ${Object.keys(results).length}, Fetching: ${toFetch.stocks.length} stocks, ${toFetch.cryptos.length} cryptos`);

    // STEP 2: Fetch stocks sequentially (rate limit constraint)
    for (const [index, stock] of toFetch.stocks.entries()) {
      try {
        const price = await this.fetchStockPrice(stock.ticker);
        results[stock.ticker] = price;
        await this.cachePrice(stock.ticker, price, stock.assetType);

        // Rate limit delay (skip on last item)
        if (index < toFetch.stocks.length - 1) {
          await new Promise(r => setTimeout(r, this.rateLimitDelay));
        }
      } catch (error) {
        console.error(`[Batch] Failed to fetch ${stock.ticker}:`, error.message);
        results[stock.ticker] = null;
      }
    }

    // STEP 3: Batch fetch cryptos (CoinGecko supports bulk)
    if (toFetch.cryptos.length > 0) {
      const ids = toFetch.cryptos
        .map(c => this.cryptoMapping[c.ticker] || c.ticker.toLowerCase())
        .join(',');

      try {
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
          params: { ids, vs_currencies: 'usd' },
          timeout: 10000
        });

        // Map results back to tickers
        for (const crypto of toFetch.cryptos) {
          const coinId = this.cryptoMapping[crypto.ticker] || crypto.ticker.toLowerCase();
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
        console.error('[Batch] Crypto bulk fetch failed:', error.message);
        
        // FIX: Set null for all failed cryptos
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
   * Gets cached price from memory or database
   * Returns null if not found or expired
   */
  async getCachedPrice(ticker) {
    const symbol = ticker.toUpperCase();

    // Check in-memory cache first (fastest)
    const memCache = this.cache.get(symbol);
    if (memCache && (Date.now() - memCache.timestamp < this.cacheTTL)) {
      return memCache.price;
    }

    // Check database cache (slower but persistent)
    try {
      const dbCache = await PriceCache.findOne({ ticker: symbol }).lean();
      
      if (dbCache) {
        const age = Date.now() - new Date(dbCache.fetchedAt).getTime();
        
        if (age < this.cacheTTL) {
          // Refresh in-memory cache
          this.cache.set(symbol, { 
            price: dbCache.price, 
            timestamp: Date.now() 
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
   */
  async cachePrice(ticker, price, assetType) {
    const symbol = ticker.toUpperCase();

    // In-memory cache (immediate)
    this.cache.set(symbol, { price, timestamp: Date.now() });

    // Database cache (persistent, non-blocking)
    try {
      await PriceCache.findOneAndUpdate(
        { ticker: symbol },
        { 
          ticker: symbol,
          price, 
          assetType, 
          fetchedAt: new Date(), 
          source: 'api' 
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`[Cache] DB write error for ${symbol}:`, error.message);
      // Don't throw - cache write failure shouldn't break the request
    }
  }

  /**
   * FIX: Properly managed cache cleanup with interval tracking
   */
  startCacheCleanup() {
    // Clear existing interval if restarted
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
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
    }, this.cacheTTL); // Run cleanup every 5 minutes

    console.log('✓ Cache cleanup scheduler started');
  }

  /**
   * Graceful shutdown - clears intervals
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    console.log('✓ PriceFetcherService destroyed');
  }
}

export default new PriceFetcherService();
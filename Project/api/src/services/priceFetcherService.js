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
  constructor(message = 'API rate limit reached') {
    super(message);
    this.name = 'RateLimitError';
  }
}

class PriceFetcherService {
  constructor() {
    this.apiKeys = {
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      finnhub: process.env.FINNHUB_API_KEY,
    };
    
    if (!this.apiKeys.alphaVantage) {
      console.warn('⚠️  ALPHA_VANTAGE_API_KEY not set - stock price fetching may fail');
    }
    
    this.cache = new Map();
    this.maxCacheSize = 1000;
    this.cacheTTL = 60000;
    this.rateLimitDelay = 250;
    this.startCacheCleanup();
  }


  async fetchPrice(ticker, assetType) {
    const cached = await this.getCachedPrice(ticker);
    if (cached) return cached;

    let price;
    switch(assetType) {
      case 'stock':
      case 'etf':
        price = await this.fetchStockPrice(ticker);
        break;
      case 'crypto':
        price = await this.fetchCryptoPrice(ticker);
        break;
      default:
        throw new Error(`Unsupported asset type: ${assetType}`);
    }

    await this.cachePrice(ticker, price, assetType);
    return price;
  }


  async fetchStockPrice(ticker) {
    if (!this.apiKeys.alphaVantage) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not configured');
    }

    const url = 'https://www.alphavantage.co/query';
    const params = {
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
      apikey: this.apiKeys.alphaVantage
    };

    try {
      const response = await axios.get(url, { params, timeout: 10000 });
      
      if (response.data.Note) {
        throw new RateLimitError('Alpha Vantage rate limit reached. Please try again later.');
      }

      const quote = response.data['Global Quote'];
      
      if (!quote || !quote['05. price']) {
        throw new PriceNotFoundError(ticker);
      }

      return parseFloat(quote['05. price']);
    } catch (error) {
      if (error.response?.status === 429) {
        throw new RateLimitError('Alpha Vantage rate limit reached');
      }
      if (error instanceof PriceNotFoundError || error instanceof RateLimitError) {
        throw error;
      }
      throw new Error(`Failed to fetch stock price for ${ticker}: ${error.message}`);
    }
  }


  async fetchCryptoPrice(ticker) {
    const coinId = this.cryptoTickerToCoinId(ticker);
    const url = 'https://api.coingecko.com/api/v3/simple/price';
    const params = {
      ids: coinId,
      vs_currencies: 'usd'
    };

    try {
      const response = await axios.get(url, { params, timeout: 10000 });
      
      if (!response.data[coinId] || !response.data[coinId].usd) {
        throw new PriceNotFoundError(ticker);
      }
      
      return response.data[coinId].usd;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new RateLimitError('CoinGecko rate limit reached');
      }
      if (error instanceof PriceNotFoundError || error instanceof RateLimitError) {
        throw error;
      }
      throw new Error(`Failed to fetch crypto price for ${ticker}: ${error.message}`);
    }
  }


  async getCachedPrice(ticker) {
    if (this.cache.has(ticker)) {
      const cached = this.cache.get(ticker);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.price;
      } else {
        this.cache.delete(ticker);
      }
    }

    try {
      const dbCache = await PriceCache.findOne({ ticker });
      if (dbCache) {
        this.setCacheEntry(ticker, dbCache.price);
        return dbCache.price;
      }
    } catch (error) {
      console.error('Error reading from price cache:', error);
    }

    return null;
  }


  async cachePrice(ticker, price, assetType) {
    this.setCacheEntry(ticker, price);

    try {
      await PriceCache.findOneAndUpdate(
        { ticker },
        { 
          ticker: ticker.toUpperCase(), 
          price, 
          assetType, 
          fetchedAt: new Date(),
          source: 'api'
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error caching price to database:', error);
    }
  }

  setCacheEntry(ticker, price) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(ticker, { 
      price, 
      timestamp: Date.now() 
    });
  }


  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      const expiredKeys = [];
      
      for (const [ticker, data] of this.cache.entries()) {
        if (now - data.timestamp > this.cacheTTL) {
          expiredKeys.push(ticker);
        }
      }
      
      expiredKeys.forEach(key => this.cache.delete(key));
      
      if (expiredKeys.length > 0) {
        console.log(`[Cache Cleanup] Removed ${expiredKeys.length} expired entries`);
      }
    }, this.cacheTTL);
  }


  async fetchBatchPrices(tickers) {
    const results = {};
    
    const stocks = tickers.filter(t => t.assetType !== 'crypto');
    const cryptos = tickers.filter(t => t.assetType === 'crypto');

    if (stocks.length > 0) {
      console.log(`Fetching ${stocks.length} stock prices...`);
      
      for (let i = 0; i < stocks.length; i++) {
        const { ticker, assetType } = stocks[i];
        try {
          results[ticker] = await this.fetchPrice(ticker, assetType);
          
          if (i < stocks.length - 1) {
            await this.delay(this.rateLimitDelay);
          }
        } catch (err) {
          console.error(`Failed to fetch ${ticker}:`, err.message);
          results[ticker] = null;
        }
      }
    }

    if (cryptos.length > 0) {
      console.log(`Fetching ${cryptos.length} crypto prices...`);
      
      try {
        const coinIds = cryptos.map(c => this.cryptoTickerToCoinId(c.ticker));
        const uniqueCoinIds = [...new Set(coinIds)];
        
        const url = 'https://api.coingecko.com/api/v3/simple/price';
        const response = await axios.get(url, {
          params: {
            ids: uniqueCoinIds.join(','),
            vs_currencies: 'usd'
          },
          timeout: 15000
        });
        
        cryptos.forEach(({ ticker }) => {
          const coinId = this.cryptoTickerToCoinId(ticker);
          const price = response.data[coinId]?.usd;
          
          if (price) {
            results[ticker] = price;
            this.cachePrice(ticker, price, 'crypto').catch(err => {
              console.error(`Failed to cache ${ticker}:`, err.message);
            });
          } else {
            results[ticker] = null;
          }
        });
      } catch (err) {
        console.error('Crypto batch fetch failed:', err.message);
        cryptos.forEach(({ ticker }) => {
          results[ticker] = null;
        });
      }
    }

    return results;
  }


  cryptoTickerToCoinId(ticker) {
    const mapping = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'USDT': 'tether',
      'USDC': 'usd-coin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'SOL': 'solana',
      'MATIC': 'matic-network',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'AVAX': 'avalanche-2',
      'LTC': 'litecoin',
    };
    
    const coinId = mapping[ticker.toUpperCase()];
    
    if (!coinId) {
      throw new PriceNotFoundError(`Unsupported cryptocurrency: ${ticker}. Please add mapping.`);
    }
    
    return coinId;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  clearCache() {
    this.cache.clear();
    console.log('[Cache] In-memory cache cleared');
  }
}

export default new PriceFetcherService();
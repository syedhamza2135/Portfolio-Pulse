import axios from 'axios';
import PriceCache from '../models/priceCache.js';

class PriceFetcherService {
  constructor() {
    this.apiKeys = {
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      finnhub: process.env.FINNHUB_API_KEY,
    };
    this.cache = new Map(); // In-memory cache
    this.rateLimitDelay = 250; // 250ms between requests (4 req/sec)
  }

  async fetchPrice(ticker, assetType) {
    // Check cache first
    const cached = await this.getCachedPrice(ticker);
    if (cached) return cached;

    // Fetch from API based on asset type
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

    // Cache the result
    await this.cachePrice(ticker, price, assetType);
    return price;
  }

  async fetchStockPrice(ticker) {
    if (!this.apiKeys.alphaVantage) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not configured');
    }

    // Alpha Vantage API
    const url = `https://www.alphavantage.co/query`;
    const params = {
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
      apikey: this.apiKeys.alphaVantage
    };

    try {
      const response = await axios.get(url, { params, timeout: 10000 });
      
      // Check for API limit message
      if (response.data.Note) {
        throw new Error('API rate limit reached. Please try again later.');
      }

      const quote = response.data['Global Quote'];
      
      if (!quote || !quote['05. price']) {
        throw new Error(`Price not found for ${ticker}`);
      }

      return parseFloat(quote['05. price']);
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('API rate limit reached. Please try again later.');
      }
      throw error;
    }
  }

  async fetchCryptoPrice(ticker) {
    // CoinGecko API (free, no key needed)
    const coinId = this.cryptoTickerToCoinId(ticker);
    const url = `https://api.coingecko.com/api/v3/simple/price`;
    const params = {
      ids: coinId,
      vs_currencies: 'usd'
    };

    try {
      const response = await axios.get(url, { params, timeout: 10000 });
      
      if (!response.data[coinId] || !response.data[coinId].usd) {
        throw new Error(`Price not found for ${ticker}`);
      }
      
      return response.data[coinId].usd;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('API rate limit reached. Please try again later.');
      }
      throw error;
    }
  }

  async getCachedPrice(ticker) {
    // Check in-memory cache first (fastest)
    if (this.cache.has(ticker)) {
      const cached = this.cache.get(ticker);
      // 1 minute TTL for in-memory cache
      if (Date.now() - cached.timestamp < 60000) {
        return cached.price;
      } else {
        // Remove expired entry
        this.cache.delete(ticker);
      }
    }

    // Check DB cache (with 15-minute TTL handled by MongoDB)
    try {
      const dbCache = await PriceCache.findOne({ ticker });
      if (dbCache) {
        // Also update in-memory cache
        this.cache.set(ticker, { 
          price: dbCache.price, 
          timestamp: Date.now() 
        });
        return dbCache.price;
      }
    } catch (error) {
      console.error('Error reading from price cache:', error);
      // Continue to fetch from API if cache read fails
    }

    return null;
  }

  async cachePrice(ticker, price, assetType) {
    // In-memory cache
    this.cache.set(ticker, { price, timestamp: Date.now() });

    // DB cache (with TTL handled by MongoDB expires field)
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
      // Don't throw - caching is not critical
    }
  }

  async fetchBatchPrices(tickers) {
    // Batch API call for multiple tickers
    // More efficient for scheduled updates
    const results = {};
    
    // Group by asset type
    const stocks = tickers.filter(t => t.assetType !== 'crypto');
    const cryptos = tickers.filter(t => t.assetType === 'crypto');

    // Fetch stocks one by one (Alpha Vantage doesn't have true batch endpoint)
    if (stocks.length > 0) {
      console.log(`Fetching ${stocks.length} stock prices...`);
      
      for (let i = 0; i < stocks.length; i++) {
        const { ticker, assetType } = stocks[i];
        try {
          results[ticker] = await this.fetchPrice(ticker, assetType);
          
          // Rate limiting: wait between requests (except for last one)
          if (i < stocks.length - 1) {
            await this.delay(this.rateLimitDelay);
          }
        } catch (err) {
          console.error(`Failed to fetch ${ticker}:`, err.message);
          results[ticker] = null;
        }
      }
    }

    // Fetch cryptos in batch (CoinGecko supports batch)
    if (cryptos.length > 0) {
      console.log(`Fetching ${cryptos.length} crypto prices...`);
      
      const coinIds = cryptos.map(c => this.cryptoTickerToCoinId(c.ticker));
      const uniqueCoinIds = [...new Set(coinIds)]; // Remove duplicates
      
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price`;
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
            // Cache the result
            this.cachePrice(ticker, price, 'crypto').catch(err => {
              console.error(`Failed to cache ${ticker}:`, err.message);
            });
          } else {
            results[ticker] = null;
          }
        });
      } catch (err) {
        console.error('Crypto batch fetch failed:', err.message);
        // Set all crypto results to null
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
    return mapping[ticker.toUpperCase()] || ticker.toLowerCase();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Clear in-memory cache (useful for testing)
  clearCache() {
    this.cache.clear();
  }
}

export default new PriceFetcherService();
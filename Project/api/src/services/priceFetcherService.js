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
    this.cacheTTL = 60000; 
    this.rateLimitDelay = 15000; // Alpha Vantage safe delay
    
    this.cryptoMapping = {
      BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
      USDT: 'tether', USDC: 'usd-coin', XRP: 'ripple',
      SOL: 'solana', DOGE: 'dogecoin', ADA: 'cardano'
    };

    this.startCacheCleanup();
  }

  async fetchPrice(ticker, assetType) {
    const symbol = ticker.toUpperCase();
    const cached = await this.getCachedPrice(symbol);
    if (cached) return cached;

    const price = assetType === 'crypto' 
      ? await this.fetchCryptoPrice(symbol) 
      : await this.fetchStockPrice(symbol);

    if (!price || price <= 0) throw new PriceNotFoundError(symbol);

    await this.cachePrice(symbol, price, assetType);
    return price;
  }

  async fetchStockPrice(ticker) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) throw new Error('API Key missing');

    try {
      const { data } = await axios.get('https://www.alphavantage.co/query', {
        params: { function: 'GLOBAL_QUOTE', symbol: ticker, apikey: apiKey },
        timeout: 10000
      });

      if (data.Note || data.Information || data['Information']) {
        throw new RateLimitError('Alpha Vantage limit reached');
      }

      const price = parseFloat(data['Global Quote']?.['05. price']);
      if (isNaN(price)) throw new PriceNotFoundError(ticker);
      
      return price;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      throw new Error(`Stock fetch failed: ${error.message}`);
    }
  }

  async fetchCryptoPrice(ticker) {
    const coinId = this.cryptoMapping[ticker] || ticker.toLowerCase();
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: coinId, vs_currencies: 'usd' }
      });
      const price = data[coinId]?.usd;
      if (!price) throw new PriceNotFoundError(ticker);
      return price;
    } catch (error) {
      if (error.response?.status === 429) throw new RateLimitError('CoinGecko Busy');
      throw error;
    }
  }

  async fetchBatchPrices(tickers) {
    const results = {};
    const stocks = tickers.filter(t => t.assetType !== 'crypto');
    const cryptos = tickers.filter(t => t.assetType === 'crypto');

    // Sequential for stocks
    for (const [index, s] of stocks.entries()) {
      try {
        results[s.ticker] = await this.fetchPrice(s.ticker, s.assetType);
        if (index < stocks.length - 1) await new Promise(r => setTimeout(r, this.rateLimitDelay));
      } catch (e) {
        results[s.ticker] = null;
      }
    }

    // Batch for cryptos
    if (cryptos.length > 0) {
      const ids = cryptos.map(c => this.cryptoMapping[c.ticker] || c.ticker.toLowerCase()).join(',');
      try {
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
          params: { ids, vs_currencies: 'usd' }
        });
        cryptos.forEach(c => {
          const id = this.cryptoMapping[c.ticker] || c.ticker.toLowerCase();
          results[c.ticker] = data[id]?.usd || null;
        });
      } catch (e) { console.error("Crypto batch failed", e.message); }
    }
    return results;
  }

  async getCachedPrice(ticker) {
    const mem = this.cache.get(ticker);
    if (mem && (Date.now() - mem.timestamp < this.cacheTTL)) return mem.price;

    const db = await PriceCache.findOne({ ticker });
    if (db && (Date.now() - new Date(db.fetchedAt).getTime() < this.cacheTTL)) {
      this.cache.set(ticker, { price: db.price, timestamp: Date.now() });
      return db.price;
    }
    return null;
  }

  async cachePrice(ticker, price, assetType) {
    this.cache.set(ticker, { price, timestamp: Date.now() });
    await PriceCache.findOneAndUpdate(
      { ticker },
      { price, assetType, fetchedAt: new Date(), source: 'api' },
      { upsert: true }
    ).catch(e => console.error("DB Cache Error", e.message));
  }

  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now - v.timestamp > this.cacheTTL) this.cache.delete(k);
      }
    }, this.cacheTTL);
  }
}

export default new PriceFetcherService();
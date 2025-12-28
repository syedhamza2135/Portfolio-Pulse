import axios from 'axios';

class PriceFetcherService {
  constructor() {
    this.apiKeys = {
      alphaVantage: process.env.ALPHA_VANTAGE_API_KEY,
      finnhub: process.env.FINNHUB_API_KEY,
    };
    this.cache = new Map(); // In-memory cache
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
    }

    // Cache the result
    await this.cachePrice(ticker, price, assetType);
    return price;
  }

  async fetchStockPrice(ticker) {
    // Alpha Vantage API
    const url = `https://www.alphavantage.co/query`;
    const params = {
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
      apikey: this.apiKeys.alphaVantage
    };

    const response = await axios.get(url, { params });
    const quote = response.data['Global Quote'];
    
    if (!quote || !quote['05. price']) {
      throw new Error(`Price not found for ${ticker}`);
    }

    return parseFloat(quote['05. price']);
  }

  async fetchCryptoPrice(ticker) {
    // CoinGecko API (free, no key needed)
    const coinId = this.cryptoTickerToCoinId(ticker);
    const url = `https://api.coingecko.com/api/v3/simple/price`;
    const params = {
      ids: coinId,
      vs_currencies: 'usd'
    };

    const response = await axios.get(url, { params });
    return response.data[coinId].usd;
  }

  async getCachedPrice(ticker) {
    // Check in-memory cache
    if (this.cache.has(ticker)) {
      const cached = this.cache.get(ticker);
      if (Date.now() - cached.timestamp < 60000) { // 1 min TTL
        return cached.price;
      }
    }

    // Check DB cache (PriceCache model)
    const dbCache = await PriceCache.findOne({ ticker });
    if (dbCache) {
      return dbCache.price;
    }

    return null;
  }

  async cachePrice(ticker, price, assetType) {
    // In-memory cache
    this.cache.set(ticker, { price, timestamp: Date.now() });

    // DB cache (with TTL)
    await PriceCache.findOneAndUpdate(
      { ticker },
      { ticker, price, assetType, fetchedAt: new Date() },
      { upsert: true }
    );
  }

  async fetchBatchPrices(tickers) {
    // Batch API call for multiple tickers
    // More efficient for scheduled updates
    const results = {};
    
    // Group by asset type
    const stocks = tickers.filter(t => t.assetType !== 'crypto');
    const cryptos = tickers.filter(t => t.assetType === 'crypto');

    // Fetch stocks in batch
    if (stocks.length > 0) {
      // Alpha Vantage batch endpoint or loop with delay
      for (const { ticker, assetType } of stocks) {
        try {
          results[ticker] = await this.fetchPrice(ticker, assetType);
          await this.delay(250); // Rate limit: 4 req/sec max
        } catch (err) {
          console.error(`Failed to fetch ${ticker}:`, err.message);
        }
      }
    }

    // Fetch cryptos in batch (CoinGecko supports batch)
    if (cryptos.length > 0) {
      const coinIds = cryptos.map(c => this.cryptoTickerToCoinId(c.ticker));
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price`;
        const response = await axios.get(url, {
          params: {
            ids: coinIds.join(','),
            vs_currencies: 'usd'
          }
        });
        
        cryptos.forEach(({ ticker }) => {
          const coinId = this.cryptoTickerToCoinId(ticker);
          results[ticker] = response.data[coinId]?.usd;
        });
      } catch (err) {
        console.error('Crypto batch fetch failed:', err.message);
      }
    }

    return results;
  }

  cryptoTickerToCoinId(ticker) {
    const mapping = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      // ... add more
    };
    return mapping[ticker] || ticker.toLowerCase();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new PriceFetcherService();
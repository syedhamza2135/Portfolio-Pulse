import Holding from '../models/holdings.js';
import priceFetcher from './priceFetcher.js';
import { recalculatePortfolioValues } from './portfolioCalculation.js';

class PriceUpdateService {
  async updateHoldingPrice(holdingId) {
    const holding = await Holding.findById(holdingId);
    if (!holding) throw new Error('Holding not found');

    const price = await priceFetcher.fetchPrice(
      holding.ticker, 
      holding.assetType
    );

    holding.currentPrice = price;
    holding.lastPriceUpdate = new Date();
    holding.priceSource = 'api';
    await holding.save();

    // Recalculate portfolio
    await recalculatePortfolioValues(holding.portfolioId);

    return holding;
  }

  async updatePortfolioPrices(portfolioId) {
    const holdings = await Holding.find({ portfolioId });
    
    if (holdings.length === 0) {
      return { updated: 0, failed: 0 };
    }

    // Get unique tickers
    const tickerMap = new Map();
    holdings.forEach(h => {
      tickerMap.set(h.ticker, h.assetType);
    });

    const tickers = Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({
      ticker, assetType
    }));

    // Batch fetch prices
    const prices = await priceFetcher.fetchBatchPrices(tickers);

    // Update each holding
    let updated = 0, failed = 0;

    for (const holding of holdings) {
      const price = prices[holding.ticker];
      if (price) {
        holding.currentPrice = price;
        holding.lastPriceUpdate = new Date();
        holding.priceSource = 'api';
        await holding.save();
        updated++;
      } else {
        failed++;
      }
    }

    // Recalculate portfolio once after all updates
    await recalculatePortfolioValues(portfolioId);

    return { updated, failed, total: holdings.length };
  }

  async updateAllPrices() {
    // Get all unique tickers across all holdings
    const holdings = await Holding.find()
      .select('ticker assetType')
      .lean();

    const tickerMap = new Map();
    holdings.forEach(h => {
      tickerMap.set(h.ticker, h.assetType);
    });

    const tickers = Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({
      ticker, assetType
    }));

    console.log(`Updating prices for ${tickers.length} unique tickers...`);

    // Batch fetch
    const prices = await priceFetcher.fetchBatchPrices(tickers);

    // Update all holdings with matching tickers
    const bulkOps = [];
    for (const [ticker, price] of Object.entries(prices)) {
      if (price) {
        bulkOps.push({
          updateMany: {
            filter: { ticker },
            update: {
              currentPrice: price,
              lastPriceUpdate: new Date(),
              priceSource: 'scheduled'
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await Holding.bulkWrite(bulkOps);
    }

    // Recalculate all portfolios
    const portfolioIds = await Holding.distinct('portfolioId');
    for (const portfolioId of portfolioIds) {
      try {
        await recalculatePortfolioValues(portfolioId);
      } catch (err) {
        console.error(`Failed to recalculate portfolio ${portfolioId}:`, err);
      }
    }

    console.log(`✓ Updated ${bulkOps.length} tickers`);
    return { updated: bulkOps.length, total: tickers.length };
  }
}

export default new PriceUpdateService();
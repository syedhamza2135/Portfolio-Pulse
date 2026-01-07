import Holding from '../models/holdings.js';
import priceFetcher, { RateLimitError } from './priceFetcherService.js';
import { recalculatePortfolioValues } from './portfolioCalculation.js';

class PriceUpdateService {
  /**
   * Updates a single holding's price and triggers a portfolio recalculation.
   * Useful for manual refresh buttons or immediate updates.
   */
  async updateHoldingPrice(holdingId) {
    const holding = await Holding.findById(holdingId);
    if (!holding) throw new Error('Holding not found');

    try {
      const price = await priceFetcher.fetchPrice(holding.ticker, holding.assetType);
      
      holding.currentPrice = price;
      holding.lastPriceUpdate = new Date();
      holding.priceSource = 'api';
      await holding.save();

      // Recalculate only the affected portfolio
      await recalculatePortfolioValues(holding.portfolioId);
      
      return holding;
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.warn(`[PriceUpdate] Rate limit hit for ${holding.ticker}. Skipping.`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Batch updates all holdings in the database.
   * Optimizes API calls by grouping unique tickers first.
   */
  async updateAllPrices() {
    const holdings = await Holding.find().select('ticker assetType portfolioId').lean();
    if (!holdings.length) return { updated: 0, portfolios: 0 };

    // 1. Group unique tickers to minimize API requests
    const tickerMap = new Map();
    holdings.forEach(h => tickerMap.set(h.ticker.toUpperCase(), h.assetType));
    
    const uniqueAssets = Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({ 
      ticker, 
      assetType 
    }));

    console.log(`[PriceUpdate] Starting batch sync for ${uniqueAssets.length} unique assets...`);

    // 2. Fetch prices (Sequential for stocks, batch for crypto via fetchBatchPrices)
    const priceMap = await priceFetcher.fetchBatchPrices(uniqueAssets);

    // 3. Prepare Bulk Operations for MongoDB
    const bulkOps = Object.entries(priceMap)
      .filter(([_, price]) => price !== null && price !== undefined)
      .map(([ticker, price]) => ({
        updateMany: {
          filter: { ticker: ticker.toUpperCase() },
          update: { 
            $set: { 
              currentPrice: price, 
              lastPriceUpdate: new Date(), 
              priceSource: 'api' 
            } 
          }
        }
      }));

    if (bulkOps.length > 0) {
      const result = await Holding.bulkWrite(bulkOps);
      console.log(`[PriceUpdate] Database updated: ${result.modifiedCount} holdings modified.`);
    }

    // 4. Trigger Recalculations for affected portfolios
    const portfolioIds = [...new Set(holdings.map(h => h.portfolioId.toString()))];
    
    // allSettled ensures one failed portfolio recalc doesn't stop the whole process
    const results = await Promise.allSettled(
      portfolioIds.map(id => recalculatePortfolioValues(id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = portfolioIds.length - successful;

    console.log(`[PriceUpdate] Recalculation complete. Success: ${successful}, Failed: ${failed}`);

    return {
      tickersUpdated: bulkOps.length,
      portfoliosUpdated: successful,
      errors: failed
    };
  }
}

export default new PriceUpdateService();
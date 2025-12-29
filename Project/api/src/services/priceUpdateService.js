import Holding from '../models/holdings.js';
import priceFetcher from './priceFetcherService.js';
import { recalculatePortfolioValues } from './portfolioCalculation.js';

class PriceUpdateService {
  async updateHoldingPrice(holdingId) {
    const holding = await Holding.findById(holdingId);
    if (!holding) {
      throw new Error('Holding not found');
    }

    try {
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
    } catch (error) {
      // Log error but don't fail if it's a rate limit issue
      if (error.message.includes('rate limit')) {
        console.warn(`Rate limit reached while updating ${holding.ticker}`);
        throw new Error(`Price update temporarily unavailable. ${error.message}`);
      }
      throw error;
    }
  }

  async updatePortfolioPrices(portfolioId) {
    const holdings = await Holding.find({ portfolioId });
    
    if (holdings.length === 0) {
      return { updated: 0, failed: 0, total: 0 };
    }

    // Get unique tickers
    const tickerMap = new Map();
    holdings.forEach(h => {
      tickerMap.set(h.ticker, h.assetType);
    });

    const tickers = Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({
      ticker, 
      assetType
    }));

    // Batch fetch prices
    let prices;
    try {
      prices = await priceFetcher.fetchBatchPrices(tickers);
    } catch (error) {
      console.error('Batch price fetch failed:', error);
      throw new Error('Failed to fetch prices from API');
    }

    // Update each holding
    let updated = 0;
    let failed = 0;

    for (const holding of holdings) {
      const price = prices[holding.ticker];
      if (price && price > 0) {
        try {
          holding.currentPrice = price;
          holding.lastPriceUpdate = new Date();
          holding.priceSource = 'api';
          await holding.save();
          updated++;
        } catch (error) {
          console.error(`Failed to save price for ${holding.ticker}:`, error);
          failed++;
        }
      } else {
        console.warn(`No price available for ${holding.ticker}`);
        failed++;
      }
    }

    // Recalculate portfolio once after all updates
    try {
      await recalculatePortfolioValues(portfolioId);
    } catch (error) {
      console.error('Failed to recalculate portfolio:', error);
      // Don't fail the entire operation
    }

    return { updated, failed, total: holdings.length };
  }

  async updateAllPrices() {
    // Get all unique tickers across all holdings
    const holdings = await Holding.find()
      .select('ticker assetType')
      .lean();

    if (holdings.length === 0) {
      console.log('No holdings found to update');
      return { updated: 0, total: 0 };
    }

    const tickerMap = new Map();
    holdings.forEach(h => {
      tickerMap.set(h.ticker, h.assetType);
    });

    const tickers = Array.from(tickerMap.entries()).map(([ticker, assetType]) => ({
      ticker, 
      assetType
    }));

    console.log(`Updating prices for ${tickers.length} unique tickers...`);

    // Batch fetch
    let prices;
    try {
      prices = await priceFetcher.fetchBatchPrices(tickers);
    } catch (error) {
      console.error('Batch price fetch failed:', error);
      throw error;
    }

    // Update all holdings with matching tickers using bulk operations
    const bulkOps = [];
    let successCount = 0;

    for (const [ticker, price] of Object.entries(prices)) {
      if (price && price > 0) {
        bulkOps.push({
          updateMany: {
            filter: { ticker },
            update: {
              $set: {
                currentPrice: price,
                lastPriceUpdate: new Date(),
                priceSource: 'scheduled'
              }
            }
          }
        });
        successCount++;
      }
    }

    if (bulkOps.length > 0) {
      try {
        const result = await Holding.bulkWrite(bulkOps);
        console.log(`✓ Bulk update completed: ${result.modifiedCount} holdings updated`);
      } catch (error) {
        console.error('Bulk write failed:', error);
        throw error;
      }
    }

    // Recalculate all affected portfolios
    const portfolioIds = await Holding.distinct('portfolioId');
    console.log(`Recalculating ${portfolioIds.length} portfolios...`);
    
    let portfolioErrors = 0;
    for (const portfolioId of portfolioIds) {
      try {
        await recalculatePortfolioValues(portfolioId);
      } catch (err) {
        console.error(`Failed to recalculate portfolio ${portfolioId}:`, err);
        portfolioErrors++;
      }
    }

    if (portfolioErrors > 0) {
      console.warn(`⚠ ${portfolioErrors} portfolios failed to recalculate`);
    }

    console.log(`✓ Price update complete: ${successCount}/${tickers.length} tickers updated`);
    return { 
      updated: successCount, 
      total: tickers.length,
      failed: tickers.length - successCount,
      portfoliosRecalculated: portfolioIds.length - portfolioErrors
    };
  }
}

export default new PriceUpdateService();
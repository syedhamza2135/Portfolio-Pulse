import mongoose from 'mongoose';
import Holding from '../models/holdings.js';
import priceFetcher, { RateLimitError, PriceNotFoundError } from './priceFetcherService.js';
import { recalculatePortfolioValues } from './portfolioCalculation.js';

class PriceUpdateService {
  /**
   * FIX: Updates a single holding's price with proper transaction handling
   * Ensures atomicity: price update + portfolio recalc succeed or both fail
   */
  async updateHoldingPrice(holdingId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const holding = await Holding.findById(holdingId).session(session);
      
      if (!holding) {
        await session.abortTransaction();
        throw new Error('Holding not found');
      }

      // Fetch price with error handling
      let price;
      try {
        price = await priceFetcher.fetchPrice(holding.ticker, holding.assetType);
      } catch (error) {
        await session.abortTransaction();
        
        if (error instanceof RateLimitError) {
          throw new Error(`Rate limit reached. Please try again later.`);
        }
        if (error instanceof PriceNotFoundError) {
          throw new Error(`Price not available for ${holding.ticker}`);
        }
        throw error;
      }

      // Update holding with new price
      holding.currentPrice = price;
      holding.lastPriceUpdate = new Date();
      holding.priceSource = 'api';
      await holding.save({ session });

      // FIX: Recalculate portfolio within the same transaction
      await recalculatePortfolioValues(holding.portfolioId, session);
      
      await session.commitTransaction();
      
      console.log(`[PriceUpdate] ✓ ${holding.ticker}: $${price}`);
      return holding;

    } catch (error) {
      await session.abortTransaction();
      console.error(`[PriceUpdate] Failed for holding ${holdingId}:`, error.message);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * FIX: Updates all holdings for a specific portfolio
   * Uses batch fetching + transaction for consistency
   */
  async updatePortfolioPrices(portfolioId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get all holdings for this portfolio
      const holdings = await Holding.find({ portfolioId })
        .select('ticker assetType')
        .session(session)
        .lean();

      if (holdings.length === 0) {
        await session.commitTransaction();
        return { updated: 0, total: 0, failed: 0 };
      }

      // Batch fetch prices
      const tickers = holdings.map(h => ({ 
        ticker: h.ticker, 
        assetType: h.assetType 
      }));
      
      const prices = await priceFetcher.fetchBatchPrices(tickers);

      // Prepare bulk operations
      const bulkOps = [];
      let updated = 0;
      let failed = 0;

      for (const ticker in prices) {
        if (prices[ticker] !== null && prices[ticker] !== undefined) {
          bulkOps.push({
            updateMany: {
              filter: { 
                portfolioId: new mongoose.Types.ObjectId(portfolioId), 
                ticker: ticker.toUpperCase() 
              },
              update: { 
                $set: { 
                  currentPrice: prices[ticker], 
                  lastPriceUpdate: new Date(), 
                  priceSource: 'api' 
                } 
              }
            }
          });
          updated++;
        } else {
          failed++;
        }
      }

      // Execute bulk update within transaction
      if (bulkOps.length > 0) {
        const result = await Holding.bulkWrite(bulkOps, { session });
        console.log(`[PriceUpdate] Portfolio ${portfolioId}: Modified ${result.modifiedCount} holdings`);
      }

      // Recalculate portfolio totals
      await recalculatePortfolioValues(portfolioId, session);

      await session.commitTransaction();

      return {
        updated,
        total: holdings.length,
        failed
      };

    } catch (error) {
      await session.abortTransaction();
      console.error(`[PriceUpdate] Portfolio update failed:`, error.message);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * FIX: Optimized batch update for all holdings with better error tracking
   * Uses unordered bulkWrite for parallel execution
   */
  async updateAllPrices() {
    try {
      // STEP 1: Get unique tickers across all holdings
      const uniqueHoldings = await Holding.aggregate([
        {
          $group: {
            _id: { ticker: '$ticker', assetType: '$assetType' },
            count: { $sum: 1 },
            portfolios: { $addToSet: '$portfolioId' }
          }
        },
        {
          $project: {
            _id: 0,
            ticker: '$_id.ticker',
            assetType: '$_id.assetType',
            count: 1,
            portfolios: 1
          }
        }
      ]);

      if (uniqueHoldings.length === 0) {
        console.log('[PriceUpdate] No holdings to update');
        return { tickersUpdated: 0, portfoliosUpdated: 0, errors: 0 };
      }

      console.log(`[PriceUpdate] Fetching prices for ${uniqueHoldings.length} unique tickers...`);

      // STEP 2: Batch fetch prices
      const tickers = uniqueHoldings.map(h => ({ 
        ticker: h.ticker, 
        assetType: h.assetType 
      }));
      
      const priceMap = await priceFetcher.fetchBatchPrices(tickers);

      // STEP 3: Prepare bulk operations (unordered for parallel execution)
      const bulkOps = [];
      let successfulTickers = 0;
      let failedTickers = 0;

      for (const [ticker, price] of Object.entries(priceMap)) {
        if (price !== null && price !== undefined && price > 0) {
          bulkOps.push({
            updateMany: {
              filter: { ticker: ticker.toUpperCase() },
              update: { 
                $set: { 
                  currentPrice: price, 
                  lastPriceUpdate: new Date(), 
                  priceSource: 'scheduled' 
                } 
              }
            }
          });
          successfulTickers++;
        } else {
          failedTickers++;
        }
      }

      // STEP 4: Execute bulk write (FIX: use ordered: false for better performance)
      let modifiedCount = 0;
      if (bulkOps.length > 0) {
        const result = await Holding.bulkWrite(bulkOps, { ordered: false });
        modifiedCount = result.modifiedCount || 0;
        console.log(`[PriceUpdate] Database updated: ${modifiedCount} holdings modified`);
      }

      // STEP 5: Collect unique portfolios that need recalculation
      const affectedPortfolios = new Set();
      uniqueHoldings.forEach(h => {
        if (priceMap[h.ticker] !== null) {
          h.portfolios.forEach(pid => affectedPortfolios.add(pid.toString()));
        }
      });

      const portfolioIds = Array.from(affectedPortfolios);
      console.log(`[PriceUpdate] Recalculating ${portfolioIds.length} portfolios...`);

      // STEP 6: FIX - Batch portfolio recalculations with better error tracking
      const recalcResults = await this.batchRecalculatePortfolios(portfolioIds);

      const summary = {
        tickersUpdated: successfulTickers,
        tickersFailed: failedTickers,
        holdingsModified: modifiedCount,
        portfoliosUpdated: recalcResults.successful,
        portfoliosFailed: recalcResults.failed,
        errors: recalcResults.errors
      };

      console.log('[PriceUpdate] Summary:', summary);
      return summary;

    } catch (error) {
      console.error('[PriceUpdate] Critical error in updateAllPrices:', error);
      throw error;
    }
  }

  /**
   * FIX: Batch portfolio recalculation with detailed error tracking
   * Processes in chunks to avoid memory issues
   */
  async batchRecalculatePortfolios(portfolioIds, chunkSize = 50) {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process portfolios in chunks
    for (let i = 0; i < portfolioIds.length; i += chunkSize) {
      const chunk = portfolioIds.slice(i, i + chunkSize);
      
      const chunkResults = await Promise.allSettled(
        chunk.map(id => recalculatePortfolioValues(id))
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.successful++;
        } else {
          results.failed++;
          const portfolioId = chunk[index];
          results.errors.push({
            portfolioId,
            error: result.reason?.message || 'Unknown error'
          });
          console.error(`[PriceUpdate] Failed to recalc portfolio ${portfolioId}:`, result.reason?.message);
        }
      });

      // Small delay between chunks to avoid overwhelming DB
      if (i + chunkSize < portfolioIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return results;
  }

  /**
   * Health check method for monitoring
   */
  async getUpdateStats() {
    const [totalHoldings, needsUpdate, recentUpdates] = await Promise.all([
      Holding.countDocuments(),
      Holding.countDocuments({ 
        $or: [
          { currentPrice: { $lte: 0 } },
          { lastPriceUpdate: { $exists: false } }
        ]
      }),
      Holding.countDocuments({ 
        lastPriceUpdate: { 
          $gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        } 
      })
    ]);

    return {
      totalHoldings,
      needsUpdate,
      recentUpdates,
      updateCoverage: totalHoldings > 0 
        ? ((totalHoldings - needsUpdate) / totalHoldings * 100).toFixed(2) + '%'
        : '0%'
    };
  }
}

export default new PriceUpdateService();
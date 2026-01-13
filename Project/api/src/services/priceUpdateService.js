/**
 * Price Update Service
 * 
 * Handles updating market prices for holdings and portfolios.
 * 
 * Features:
 * - Single holding price updates with transaction support
 * - Portfolio-wide batch price updates
 * - System-wide price updates (scheduled job)
 * - Automatic portfolio value recalculation after price updates
 * - Error handling for rate limits and missing prices
 * 
 * @module services/priceUpdateService
 * @requires mongoose
 * @requires services/priceFetcherService
 * @requires services/portfolioCalculation
 */

import mongoose from "mongoose";
import Holding from "../models/holdings.js";
import priceFetcher, {
  RateLimitError,
  PriceNotFoundError,
} from "./priceFetcherService.js";
import { recalculatePortfolioValues } from "./portfolioCalculation.js";

class PriceUpdateService {
  /**
   * Updates a single holding's price with proper transaction handling
   * 
   * Process:
   * 1. Fetches latest price from external API
   * 2. Updates holding with new price and timestamp
   * 3. Recalculates parent portfolio value
   * 
   * Uses MongoDB transactions to ensure data consistency.
   * 
   * @async
   * @function updateHoldingPrice
   * @param {string} holdingId - Holding ID to update
   * 
   * @returns {Promise<Object>} Updated holding document
   * @throws {Error} If holding not found, rate limit reached, or price unavailable
   */
  async updateHoldingPrice(holdingId) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const holding = await Holding.findById(holdingId).session(session);
        if (!holding) throw new Error("Holding not found");

        try {
          const price = await priceFetcher.fetchPrice(holding.ticker, holding.assetType);
          
          holding.currentPrice = price;
          holding.lastPriceUpdate = new Date();
          holding.priceSource = "api";
          await holding.save({ session });

          await recalculatePortfolioValues(holding.portfolioId, session);
          
          console.log(`[PriceUpdate] ✓ ${holding.ticker}: $${price}`);
          return holding;
        } catch (error) {
          if (error instanceof RateLimitError) throw new Error("Rate limit reached.");
          if (error instanceof PriceNotFoundError) throw new Error(`Price unavailable for ${holding.ticker}`);
          throw error;
        }
      }, {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxTimeMS: 10000 
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Updates all holdings for a specific portfolio
   * 
   * More efficient than updating holdings individually:
   * - Batch fetches prices for all holdings
   * - Uses bulk write operations
   * - Single portfolio recalculation
   * 
   * @async
   * @function updatePortfolioPrices
   * @param {string} portfolioId - Portfolio ID to update
   * 
   * @returns {Promise<Object>} Update results
   * @returns {number} return.updated - Number of holdings successfully updated
   * @returns {number} return.total - Total number of holdings
   * @returns {number} return.failed - Number of holdings that failed to update
   * 
   * @throws {Error} If transaction fails
   */
  async updatePortfolioPrices(portfolioId) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        const holdings = await Holding.find({ portfolioId })
          .select("ticker assetType")
          .session(session)
          .lean();

        if (holdings.length === 0) return { updated: 0, total: 0, failed: 0 };

        const tickers = holdings.map((h) => ({ ticker: h.ticker, assetType: h.assetType }));
        const prices = await priceFetcher.fetchBatchPrices(tickers);

        const bulkOps = holdings
          .filter(h => prices[h.ticker] != null)
          .map(h => ({
            updateMany: {
              filter: { 
                portfolioId: new mongoose.Types.ObjectId(portfolioId), 
                ticker: h.ticker.toUpperCase() 
              },
              update: {
                $set: {
                  currentPrice: prices[h.ticker],
                  lastPriceUpdate: new Date(),
                  priceSource: "api",
                },
              },
            },
          }));

        if (bulkOps.length > 0) {
          await Holding.bulkWrite(bulkOps, { session });
        }

        await recalculatePortfolioValues(portfolioId, session);
        return { updated: bulkOps.length, total: holdings.length, failed: holdings.length - bulkOps.length };
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Optimized batch update for all holdings across all portfolios
   * 
   * Used by scheduled cron job to update all prices system-wide.
   * 
   * Optimization strategy:
   * 1. Groups holdings by unique ticker+assetType (avoids duplicate API calls)
   * 2. Batch fetches prices for all unique tickers
   * 3. Uses bulk write to update all holdings at once
   * 4. Recalculates affected portfolios in chunks
   * 
   * @async
   * @function updateAllPrices
   * 
   * @returns {Promise<Object>} Update statistics
   * @returns {number} return.tickersUpdated - Number of unique tickers updated
   * @returns {number} return.holdingsModified - Number of holdings modified
   * @returns {number} return.portfoliosUpdated - Number of portfolios recalculated
   * @returns {number} return.portfoliosFailed - Number of portfolio recalculations that failed
   * @returns {Array} return.errors - Array of error details (max 100)
   * 
   * @throws {Error} If critical error occurs during batch update
   */
  async updateAllPrices() {
    try {
      const uniqueHoldings = await Holding.aggregate([
        { $group: { _id: { ticker: "$ticker", assetType: "$assetType" }, portfolios: { $addToSet: "$portfolioId" } } },
        { $project: { _id: 0, ticker: "$_id.ticker", assetType: "$_id.assetType", portfolios: 1 } }
      ]);

      if (uniqueHoldings.length === 0) return { tickersUpdated: 0, portfoliosUpdated: 0, errors: 0 };

      const tickers = uniqueHoldings.map(h => ({ ticker: h.ticker, assetType: h.assetType }));
      const priceMap = await priceFetcher.fetchBatchPrices(tickers);

      const bulkOps = [];
      const affectedPortfolios = new Set();

      for (const h of uniqueHoldings) {
        const price = priceMap[h.ticker];
        if (price != null && price > 0) {
          bulkOps.push({
            updateMany: {
              filter: { ticker: h.ticker.toUpperCase() },
              update: { $set: { currentPrice: price, lastPriceUpdate: new Date(), priceSource: "scheduled" } }
            }
          });
          h.portfolios.forEach(pid => affectedPortfolios.add(pid.toString()));
        }
      }

      let modifiedCount = 0;
      if (bulkOps.length > 0) {
        const result = await Holding.bulkWrite(bulkOps, { ordered: false });
        modifiedCount = result.modifiedCount || 0;
      }

      const portfolioIds = Array.from(affectedPortfolios);
      const recalcResults = await this.batchRecalculatePortfolios(portfolioIds);

      return {
        tickersUpdated: bulkOps.length,
        holdingsModified: modifiedCount,
        portfoliosUpdated: recalcResults.successful,
        portfoliosFailed: recalcResults.failed,
        errors: recalcResults.errors,
      };
    } catch (error) {
      console.error("[PriceUpdate] Critical error in updateAllPrices:", error);
      throw error;
    }
  }

  /**
   * Recalculates portfolio values in batches
   * 
   * Processes portfolios in chunks to avoid overwhelming the database.
   * Uses Promise.allSettled to ensure partial failures don't stop processing.
   * 
   * @async
   * @function batchRecalculatePortfolios
   * @param {Array<string>} portfolioIds - Array of portfolio IDs to recalculate
   * @param {number} [chunkSize=50] - Number of portfolios to process per chunk
   * 
   * @returns {Promise<Object>} Recalculation results
   * @returns {number} return.successful - Number of successful recalculations
   * @returns {number} return.failed - Number of failed recalculations
   * @returns {Array} return.errors - Array of error details (max 100)
   */
  async batchRecalculatePortfolios(portfolioIds, chunkSize = 50) {
    const results = { successful: 0, failed: 0, errors: [] };
    
    // Process portfolios in chunks
    for (let i = 0; i < portfolioIds.length; i += chunkSize) {
      const chunk = portfolioIds.slice(i, i + chunkSize);
      
      // Recalculate all portfolios in chunk in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map(id => recalculatePortfolioValues(id))
      );

      // Process results
      chunkResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.successful++;
        } else {
          results.failed++;
          // Limit error array size to prevent memory issues
          if (results.errors.length < 100) {
            results.errors.push({ 
              portfolioId: chunk[index], 
              error: result.reason?.message 
            });
          }
        }
      });
      
      // Small delay between chunks to avoid overwhelming database
      if (i + chunkSize < portfolioIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return results;
  }

  /**
   * Gets price update statistics
   * 
   * Provides metrics about price update coverage across all holdings.
   * Useful for monitoring and identifying holdings that need price updates.
   * 
   * @async
   * @function getUpdateStats
   * 
   * @returns {Promise<Object>} Update statistics
   * @returns {number} return.totalHoldings - Total number of holdings
   * @returns {number} return.needsUpdate - Holdings needing price updates
   * @returns {string} return.updateCoverage - Percentage of holdings with valid prices
   */
  async getUpdateStats() {
    const totalHoldings = await Holding.countDocuments();
    
    // Count holdings that need price updates
    // Either no price (<= 0) or never updated
    const needsUpdate = await Holding.countDocuments({
      $or: [
        { currentPrice: { $lte: 0 } }, 
        { lastPriceUpdate: { $exists: false } }
      ]
    });

    return {
      totalHoldings,
      needsUpdate,
      // Calculate coverage percentage
      updateCoverage: totalHoldings > 0 
        ? (((totalHoldings - needsUpdate) / totalHoldings) * 100).toFixed(2) + "%" 
        : "0%"
    };
  }
}

export default new PriceUpdateService();
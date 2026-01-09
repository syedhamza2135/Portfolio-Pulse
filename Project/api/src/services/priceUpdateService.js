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
   * Optimized batch update for all holdings
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

  async batchRecalculatePortfolios(portfolioIds, chunkSize = 50) {
    const results = { successful: 0, failed: 0, errors: [] };
    
    for (let i = 0; i < portfolioIds.length; i += chunkSize) {
      const chunk = portfolioIds.slice(i, i + chunkSize);
      const chunkResults = await Promise.allSettled(chunk.map(id => recalculatePortfolioValues(id)));

      chunkResults.forEach((result, index) => {
        if (result.status === "fulfilled") results.successful++;
        else {
          results.failed++;
          if (results.errors.length < 100) {
            results.errors.push({ portfolioId: chunk[index], error: result.reason?.message });
          }
        }
      });
      if (i + chunkSize < portfolioIds.length) await new Promise(r => setTimeout(r, 100));
    }
    return results;
  }

  async getUpdateStats() {
    const totalHoldings = await Holding.countDocuments();
    const needsUpdate = await Holding.countDocuments({
      $or: [{ currentPrice: { $lte: 0 } }, { lastPriceUpdate: { $exists: false } }]
    });

    return {
      totalHoldings,
      needsUpdate,
      updateCoverage: totalHoldings > 0 ? (((totalHoldings - needsUpdate) / totalHoldings) * 100).toFixed(2) + "%" : "0%"
    };
  }
}

export default new PriceUpdateService();
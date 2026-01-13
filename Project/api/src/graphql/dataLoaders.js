/**
 * GraphQL DataLoader Configuration
 * 
 * DataLoaders solve the N+1 query problem in GraphQL by:
 * - Batching multiple requests into a single database query
 * - Caching results within a single request
 * - Reducing database load significantly
 * 
 * Each DataLoader batches requests that occur within a single tick of the event loop,
 * then executes one database query for all batched requests.
 * 
 * @module graphql/dataLoaders
 * @requires dataloader
 */

import DataLoader from "dataloader";
import Holding from "../models/holdings.js";
import RiskMetrics from "../models/riskMetrics.js";
import SentimentData from "../models/sentimentData.js";

/**
 * Creates DataLoader instances for GraphQL resolvers
 * 
 * Creates three DataLoaders:
 * 1. holdingsByPortfolio: Batches holding queries by portfolio ID
 * 2. riskMetricsByPortfolio: Batches risk metrics queries by portfolio ID
 * 3. sentimentByTicker: Batches sentiment queries by ticker
 * 
 * Each DataLoader is scoped to a single GraphQL request.
 * 
 * @function createLoaders
 * 
 * @returns {Object} Object containing DataLoader instances
 * @returns {DataLoader} return.holdingsByPortfolio - DataLoader for holdings queries
 * @returns {DataLoader} return.riskMetricsByPortfolio - DataLoader for risk metrics queries
 * @returns {DataLoader} return.sentimentByTicker - DataLoader for sentiment queries
 */
export function createLoaders() {
  // DataLoader: Batches holding queries by portfolio ID
  // Example: If 10 portfolios request holdings, this makes 1 query instead of 10
  const holdingsByPortfolio = new DataLoader(async (portfolioIds) => {
    // Single query for all portfolio IDs
    const holdings = await Holding.find({ portfolioId: { $in: portfolioIds } }).lean();
    
    // Group holdings by portfolio ID
    const map = new Map();
    holdings.forEach((h) => {
      const id = h.portfolioId.toString();
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(h);
    });
    
    // Return holdings in the same order as requested portfolio IDs
    // Returns empty array if portfolio has no holdings
    return portfolioIds.map((id) => map.get(id.toString()) || []);
  });

  // DataLoader: Batches risk metrics queries by portfolio ID
  // Returns the most recent risk metrics for each portfolio
  const riskMetricsByPortfolio = new DataLoader(async (portfolioIds) => {
    // Single query for all portfolio IDs, sorted by calculation date (newest first)
    const metrics = await RiskMetrics.find({ portfolioId: { $in: portfolioIds } })
      .sort({ calculatedAt: -1 })
      .lean();
    
    // Map portfolio ID to risk metrics (one-to-one relationship)
    const map = new Map();
    metrics.forEach((m) => map.set(m.portfolioId.toString(), m));
    
    // Return metrics in the same order as requested portfolio IDs
    // Returns null if portfolio has no risk metrics
    return portfolioIds.map((id) => map.get(id.toString()) || null);
  });

  // DataLoader: Batches sentiment queries by ticker
  // Returns the most recent sentiment data for each ticker
  const sentimentByTicker = new DataLoader(async (tickers) => {
    // Single query for all tickers, sorted by calculation date (newest first)
    const data = await SentimentData.find({ ticker: { $in: tickers } })
      .sort({ calculatedAt: -1 });
    
    // Map ticker to sentiment data (one-to-one relationship)
    // Only keeps the first (most recent) result for each ticker
    const map = new Map();
    data.forEach((d) => {
      if (!map.has(d.ticker)) map.set(d.ticker, d);
    });
    
    // Return sentiment in the same order as requested tickers
    // Returns null if ticker has no sentiment data
    return tickers.map((t) => map.get(t) || null);
  });

  return {
    holdingsByPortfolio,
    riskMetricsByPortfolio,
    sentimentByTicker,
  };
}

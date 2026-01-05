import DataLoader from 'dataloader';
import Holding from '../models/holdings.js';
import RiskMetrics from '../models/riskMetrics.js';


const holdingsByPortfolioLoader = new DataLoader(async (portfolioIds) => {
  const holdings = await Holding.find({
    portfolioId: { $in: portfolioIds }
  }).lean();
  
  const holdingMap = new Map();
  holdings.forEach(holding => {
    const id = holding.portfolioId.toString();
    if (!holdingMap.has(id)) {
      holdingMap.set(id, []);
    }
    holdingMap.get(id).push(holding);
  });
  
  return portfolioIds.map(id => holdingMap.get(id.toString()) || []);
});


const riskMetricsByPortfolioLoader = new DataLoader(async (portfolioIds) => {
  const riskMetrics = await RiskMetrics.find({
    portfolioId: { $in: portfolioIds }
  })
  .sort({ calculatedAt: -1 })
  .lean();
  
  const metricsMap = new Map();
  riskMetrics.forEach(metric => {
    const id = metric.portfolioId.toString();
    if (!metricsMap.has(id)) {
      metricsMap.set(id, metric);
    }
  });
  
  return portfolioIds.map(id => metricsMap.get(id.toString()) || null);
});


export function createLoaders() {
  return {
    holdingsByPortfolio: holdingsByPortfolioLoader,
    riskMetricsByPortfolio: riskMetricsByPortfolioLoader
  };
}

/**
 * Usage in resolvers:
 * 
 * Portfolio: {
 *   holdings: async (portfolio, _, { loaders }) => {
 *     return loaders.holdingsByPortfolio.load(portfolio._id);
 *   },
 *   riskMetrics: async (portfolio, _, { loaders }) => {
 *     return loaders.riskMetricsByPortfolio.load(portfolio._id);
 *   }
 * }
 */
import DataLoader from "dataloader";
import Holding from "../models/holdings.js";
import RiskMetrics from "../models/riskMetrics.js";
import SentimentData from "../models/sentimentData.js";

export function createLoaders() {
  const holdingsByPortfolio = new DataLoader(async (portfolioIds) => {
    const holdings = await Holding.find({ portfolioId: { $in: portfolioIds } }).lean();
    const map = new Map();
    holdings.forEach((h) => {
      const id = h.portfolioId.toString();
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(h);
    });
    return portfolioIds.map((id) => map.get(id.toString()) || []);
  });

  const riskMetricsByPortfolio = new DataLoader(async (portfolioIds) => {
    const metrics = await RiskMetrics.find({ portfolioId: { $in: portfolioIds } }).sort({ calculatedAt: -1 }).lean();
    const map = new Map();
    metrics.forEach((m) => map.set(m.portfolioId.toString(), m));
    return portfolioIds.map((id) => map.get(id.toString()) || null);
  });

  const sentimentByTicker = new DataLoader(async (tickers) => {
    const data = await SentimentData.find({ ticker: { $in: tickers } }).sort({ calculatedAt: -1 });
    const map = new Map();
    data.forEach((d) => {
      if (!map.has(d.ticker)) map.set(d.ticker, d);
    });
    return tickers.map((t) => map.get(t) || null);
  });

  return {
    holdingsByPortfolio,
    riskMetricsByPortfolio,
    sentimentByTicker,
  };
}

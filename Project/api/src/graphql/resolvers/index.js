import User from "../../models/user.js";
import Portfolio from "../../models/portfolio.js";
import Holding from "../../models/holdings.js";
import SentimentData from "../../models/sentimentData.js";
import RiskMetrics from "../../models/riskMetrics.js";
import { GraphQLError } from "graphql";

// Helper errors
class NotFoundError extends GraphQLError {
  constructor(message) {
    super(message, { extensions: { code: "NOT_FOUND" } });
  }
}
class ForbiddenError extends GraphQLError {
  constructor(message) {
    super(message, { extensions: { code: "FORBIDDEN" } });
  }
}
class BadInputError extends GraphQLError {
  constructor(message) {
    super(message, { extensions: { code: "BAD_USER_INPUT" } });
  }
}

// Auth helpers
function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('You must be logged in', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.user;
}

function getUserId(context) {
  const user = requireAuth(context);
  
  if (!user.sub) {
    throw new GraphQLError('Invalid token: missing user ID', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  
  return user.sub;
}

// Stats calculation helper
async function calculatePortfolioStats(portfolios) {
  const portfolioIds = portfolios.map((p) => p._id);
  const holdings = await Holding.find({ portfolioId: { $in: portfolioIds } });

  let totalInvestment = 0;
  let currentValue = 0;

  holdings.forEach((h) => {
    const cost = h.quantity * h.averageCost;
    totalInvestment += cost;
    currentValue += h.currentPrice > 0 ? h.quantity * h.currentPrice : cost;
  });

  const totalProfitLoss = currentValue - totalInvestment;
  const totalProfitLossPercent =
    totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

  return {
    totalPortfolios: portfolios.length,
    totalHoldings: holdings.length,
    totalInvestment: Math.round(totalInvestment * 100) / 100,
    currentValue: Math.round(currentValue * 100) / 100,
    totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
    totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
    portfoliosWithHoldings: portfolioIds.length,
    lastUpdated: new Date().toISOString(),
  };
}

export default {
  Query: {
    me: async (_, __, context) => {
      const userId = getUserId(context);
      const user = await User.findById(userId).select("-passwordHash");
      if (!user) throw new NotFoundError("User not found");
      return user;
    },

    portfolio: async (_, { id }, context) => {
      const userId = getUserId(context);
      const portfolio = await Portfolio.findOne({ _id: id, userId });
      if (!portfolio) throw new NotFoundError("Portfolio not found");
      return portfolio;
    },

    portfolios: async (_, { filter }, context) => {
      const userId = getUserId(context);
      const query = { userId };
      if (filter?.name) query.name = { $regex: filter.name, $options: "i" };
      return await Portfolio.find(query).sort({ createdAt: 1 });
    },

    dashboardData: async (_, { portfolioLimit, topHoldingsLimit }, context) => {
      const userId = getUserId(context);

      // Fetch user and portfolios
      const [user, portfoliosAll] = await Promise.all([
        User.findById(userId).select("-passwordHash"),
        Portfolio.find({ userId }).sort({ createdAt: 1 }),
      ]);

      if (!user) throw new NotFoundError("User not found");

      // Apply portfolioLimit if provided
      const portfolios = portfolioLimit
        ? portfoliosAll.slice(0, portfolioLimit)
        : portfoliosAll;

      // Fetch holdings for selected portfolios
      let holdings = [];
      if (context.loaders?.holdingsByPortfolio) {
        const batches = await Promise.all(
          portfolios.map((p) => context.loaders.holdingsByPortfolio.load(p._id))
        );
        holdings = batches.flat();
      } else {
        holdings = await Holding.find({
          portfolioId: { $in: portfolios.map((p) => p._id) },
        });
      }

      // Calculate total stats
      const overallStats = await calculatePortfolioStats(portfolios);

      // Sort holdings by profit/loss
      const holdingsWithPL = holdings
        .filter((h) => h.currentPrice > 0)
        .map((h) => {
          const cost = h.quantity * h.averageCost;
          const value = h.quantity * h.currentPrice;
          const pl = value - cost;

          // Check if toObject exists (Mongoose Document) or use as is (Lean/POJO)
          const rawHolding =
            typeof h.toObject === "function" ? h.toObject() : h;

          return { ...rawHolding, profitLoss: pl };
        })
        .sort((a, b) => b.profitLoss - a.profitLoss);

      // Apply topHoldingsLimit if provided
      const topGainers = topHoldingsLimit
        ? holdingsWithPL.slice(0, topHoldingsLimit)
        : holdingsWithPL.slice(0, 5);
      const topLosers = topHoldingsLimit
        ? holdingsWithPL.slice(-topHoldingsLimit).reverse()
        : holdingsWithPL.slice(-5).reverse();

      return {
        user,
        portfolios,
        overallStats,
        recentActivity: [], // TODO: implement later
        topGainers,
        topLosers,
      };
    },

    holding: async (_, { id }, context) => {
      const userId = getUserId(context);
      const holding = await Holding.findById(id);
      if (!holding) throw new NotFoundError("Holding not found");

      const portfolio = await Portfolio.findOne({
        _id: holding.portfolioId,
        userId,
      });
      if (!portfolio) throw new ForbiddenError("Access denied");

      return holding;
    },

    holdings: async (_, { filter }, context) => {
      if (!filter.portfolioId)
        throw new BadInputError("portfolioId is required");
      const userId = getUserId(context);

      const portfolio = await Portfolio.findOne({
        _id: filter.portfolioId,
        userId,
      });
      if (!portfolio)
        throw new ForbiddenError("Portfolio not found or access denied");

      const query = { portfolioId: filter.portfolioId };
      if (filter.ticker) query.ticker = filter.ticker.toUpperCase();
      if (filter.assetType) query.assetType = filter.assetType;

      return await Holding.find(query).sort({ createdAt: 1 });
    },

    portfolioStats: async (_, { portfolioId }, context) => {
      const userId = getUserId(context);
      if (portfolioId) {
        const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
        if (!portfolio) throw new NotFoundError("Portfolio not found");
        return calculatePortfolioStats([portfolio]);
      } else {
        const portfolios = await Portfolio.find({ userId });
        return calculatePortfolioStats(portfolios);
      }
    },

    tickerPrice: async (_, { ticker, assetType }) => {
      const priceFetcher = await import(
        "../../services/priceFetcherService.js"
      );
      const price = await priceFetcher.default.fetchPrice(
        ticker.toUpperCase(),
        assetType
      );
      return {
        ticker: ticker.toUpperCase(),
        price,
        change: 0,
        changePercent: 0,
        timestamp: new Date().toISOString(),
      };
    },
  },

  Portfolio: {
    holdings: async (portfolio, _, { loaders }) =>
      loaders.holdingsByPortfolio.load(portfolio._id),
    riskMetrics: async (portfolio, _, { loaders }) =>
      loaders.riskMetricsByPortfolio.load(portfolio._id),
    stats: async (portfolio) => calculatePortfolioStats([portfolio]),
  },

  Holding: {
    currentValue: (h) =>
      h.currentPrice > 0
        ? h.quantity * h.currentPrice
        : h.quantity * h.averageCost,
    totalCost: (h) => h.quantity * h.averageCost,
    profitLoss: (h) =>
      (h.currentPrice > 0
        ? h.quantity * h.currentPrice
        : h.quantity * h.averageCost) -
      h.quantity * h.averageCost,
    profitLossPercent: (h) => {
      const cost = h.quantity * h.averageCost;
      const pl =
        (h.currentPrice > 0 ? h.quantity * h.currentPrice : cost) - cost;
      return cost > 0 ? (pl / cost) * 100 : 0;
    },
    sentiment: async (holding, _, { loaders }) => {
      if (loaders?.sentimentByTicker)
        return loaders.sentimentByTicker.load(holding.ticker);
      return await SentimentData.findOne({ ticker: holding.ticker }).sort({
        calculatedAt: -1,
      });
    },
    priceHistory: async () => [],
  },

  Mutation: {
    updateUserPreferences: async (
      _,
      { alertThreshold, emailEnabled },
      context
    ) => {
      const userId = getUserId(context);
      const update = {};
      if (alertThreshold !== undefined)
        update["preferences.alertThreshold"] = alertThreshold;
      if (emailEnabled !== undefined)
        update["preferences.emailEnabled"] = emailEnabled;

      return await User.findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true }
      ).select("-passwordHash");
    },

    refreshHoldingPrice: async (_, { id }, context) => {
      const userId = getUserId(context);
      const holding = await Holding.findById(id);
      if (!holding) throw new NotFoundError("Holding not found");

      const portfolio = await Portfolio.findOne({
        _id: holding.portfolioId,
        userId,
      });
      if (!portfolio) throw new ForbiddenError("Access denied");

      const priceUpdateService = await import(
        "../../services/priceUpdateService.js"
      );
      return await priceUpdateService.default.updateHoldingPrice(id);
    },

    refreshPortfolioPrices: async (_, { id }, context) => {
      const userId = getUserId(context);
      const portfolio = await Portfolio.findOne({ _id: id, userId });
      if (!portfolio) throw new NotFoundError("Portfolio not found");

      const priceUpdateService = await import(
        "../../services/priceUpdateService.js"
      );
      await priceUpdateService.default.updatePortfolioPrices(id);
      return await Portfolio.findById(id);
    },
  },
};

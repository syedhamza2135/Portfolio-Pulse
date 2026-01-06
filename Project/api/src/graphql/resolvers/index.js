import User from "../../models/user.js";
import Portfolio from "../../models/portfolio.js";
import Holding from "../../models/holdings.js";
import SentimentData from "../../models/sentimentData.js";
import RiskMetrics from "../../models/riskMetrics.js";
import { GraphQLError } from "graphql";

function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError("You must be logged in", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.user;
}

function getUserId(context) {
  const user = requireAuth(context);
  return user.sub;
}

export default {
  Query: {
    me: async (_, __, context) => {
      try {
        const userId = getUserId(context);
        const user = await User.findById(userId).select("-passwordHash");

        if (!user) {
          throw new GraphQLError("User not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return user;
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to fetch user", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    portfolio: async (_, { id }, context) => {
      try {
        const userId = getUserId(context);

        const portfolio = await Portfolio.findOne({ _id: id, userId });

        if (!portfolio) {
          throw new GraphQLError("Portfolio not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        return portfolio;
      } catch (err) {
        if (err instanceof GraphQLError) throw err;

        if (err.name === "CastError") {
          throw new GraphQLError("Invalid portfolio ID format", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        throw new GraphQLError("Failed to fetch portfolio", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    portfolios: async (_, { filter }, context) => {
      try {
        const userId = getUserId(context);

        const query = { userId };
        if (filter?.name) {
          query.name = { $regex: filter.name, $options: "i" };
        }

        return await Portfolio.find(query).sort({ createdAt: 1 });
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to fetch portfolios", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    dashboardData: async (_, __, context) => {
      try {
        const userId = getUserId(context);

        const [user, portfolios] = await Promise.all([
          User.findById(userId).select("-passwordHash"),
          Portfolio.find({ userId }).sort({ createdAt: 1 }),
        ]);

        if (!user) {
          throw new GraphQLError("User not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const portfolioIds = portfolios.map((p) => p._id);
        const holdings = await Holding.find({
          portfolioId: { $in: portfolioIds },
        }).sort({ createdAt: 1 });

        let totalInvestment = 0;
        let currentValue = 0;

        holdings.forEach((h) => {
          const cost = h.quantity * h.averageCost;
          totalInvestment += cost;
          currentValue +=
            h.currentPrice > 0 ? h.quantity * h.currentPrice : cost;
        });

        const totalProfitLoss = currentValue - totalInvestment;
        const totalProfitLossPercent =
          totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

        const holdingsWithPL = holdings
          .filter((h) => h.currentPrice > 0)
          .map((h) => {
            const cost = h.quantity * h.averageCost;
            const value = h.quantity * h.currentPrice;
            const pl = value - cost;
            return { ...h.toObject(), profitLoss: pl };
          })
          .sort((a, b) => b.profitLoss - a.profitLoss);

        return {
          user,
          portfolios,
          overallStats: {
            totalPortfolios: portfolios.length,
            totalHoldings: holdings.length,
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            currentValue: Math.round(currentValue * 100) / 100,
            totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
            totalProfitLossPercent:
              Math.round(totalProfitLossPercent * 100) / 100,
            portfoliosWithHoldings: portfolioIds.length,
            lastUpdated: new Date().toISOString(),
          },
          recentActivity: [],
          topGainers: holdingsWithPL.slice(0, 5),
          topLosers: holdingsWithPL.slice(-5).reverse(),
        };
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        console.error("Dashboard data error:", err);
        throw new GraphQLError("Failed to load dashboard data", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    holding: async (_, { id }, context) => {
      try {
        const userId = getUserId(context);

        const holding = await Holding.findById(id);
        if (!holding) {
          throw new GraphQLError("Holding not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const portfolio = await Portfolio.findOne({
          _id: holding.portfolioId,
          userId,
        });

        if (!portfolio) {
          throw new GraphQLError("Access denied", {
            extensions: { code: "FORBIDDEN" },
          });
        }

        return holding;
      } catch (err) {
        if (err instanceof GraphQLError) throw err;

        if (err.name === "CastError") {
          throw new GraphQLError("Invalid holding ID format", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        throw new GraphQLError("Failed to fetch holding", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    holdings: async (_, { filter }, context) => {
      try {
        const userId = getUserId(context);

        if (!filter.portfolioId) {
          throw new GraphQLError("portfolioId is required", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const portfolio = await Portfolio.findOne({
          _id: filter.portfolioId,
          userId,
        });

        if (!portfolio) {
          throw new GraphQLError("Portfolio not found or access denied", {
            extensions: { code: "FORBIDDEN" },
          });
        }

        const query = { portfolioId: filter.portfolioId };
        if (filter.ticker) {
          query.ticker = filter.ticker.toUpperCase();
        }
        if (filter.assetType) {
          query.assetType = filter.assetType;
        }

        return await Holding.find(query).sort({ createdAt: 1 });
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to fetch holdings", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    portfolioStats: async (_, { portfolioId }, context) => {
      try {
        const userId = getUserId(context);

        if (portfolioId) {
          const portfolio = await Portfolio.findOne({
            _id: portfolioId,
            userId,
          });

          if (!portfolio) {
            throw new GraphQLError("Portfolio not found", {
              extensions: { code: "NOT_FOUND" },
            });
          }

          const holdings = await Holding.find({ portfolioId });

          let totalInvestment = 0;
          let currentValue = 0;

          holdings.forEach((h) => {
            const cost = h.quantity * h.averageCost;
            totalInvestment += cost;
            currentValue +=
              h.currentPrice > 0 ? h.quantity * h.currentPrice : cost;
          });

          const totalProfitLoss = currentValue - totalInvestment;
          const totalProfitLossPercent =
            totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

          return {
            totalPortfolios: 1,
            totalHoldings: holdings.length,
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            currentValue: Math.round(currentValue * 100) / 100,
            totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
            totalProfitLossPercent:
              Math.round(totalProfitLossPercent * 100) / 100,
            portfoliosWithHoldings: holdings.length > 0 ? 1 : 0,
            lastUpdated: new Date().toISOString(),
          };
        } else {
          const portfolios = await Portfolio.find({ userId });
          const portfolioIds = portfolios.map((p) => p._id);
          const holdings = await Holding.find({
            portfolioId: { $in: portfolioIds },
          });

          let totalInvestment = 0;
          let currentValue = 0;

          holdings.forEach((h) => {
            const cost = h.quantity * h.averageCost;
            totalInvestment += cost;
            currentValue +=
              h.currentPrice > 0 ? h.quantity * h.currentPrice : cost;
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
            totalProfitLossPercent:
              Math.round(totalProfitLossPercent * 100) / 100,
            portfoliosWithHoldings: portfolioIds.length,
            lastUpdated: new Date().toISOString(),
          };
        }
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to fetch portfolio stats", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    tickerPrice: async (_, { ticker, assetType }) => {
      try {
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
      } catch (err) {
        throw new GraphQLError(`Failed to fetch price for ${ticker}`, {
          extensions: { code: "EXTERNAL_API_ERROR" },
        });
      }
    },
  },

  Portfolio: {
    holdings: async (portfolio, _, { loaders }) => {
      return loaders.holdingsByPortfolio.load(portfolio._id);
    },

    riskMetrics: async (portfolio, _, { loaders }) => {
      return loaders.riskMetricsByPortfolio.load(portfolio._id);
    },

    stats: async (portfolio) => {
      const holdings = await Holding.find({ portfolioId: portfolio._id });

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
        totalPortfolios: 1,
        totalHoldings: holdings.length,
        totalInvestment: Math.round(totalInvestment * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
        totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
        portfoliosWithHoldings: holdings.length > 0 ? 1 : 0,
        lastUpdated: new Date().toISOString(),
      };
    },
  },

  Holding: {
    currentValue: (holding) => {
      return holding.currentPrice > 0
        ? holding.quantity * holding.currentPrice
        : holding.quantity * holding.averageCost;
    },

    totalCost: (holding) => {
      return holding.quantity * holding.averageCost;
    },

    profitLoss: (holding) => {
      const cost = holding.quantity * holding.averageCost;
      const value =
        holding.currentPrice > 0
          ? holding.quantity * holding.currentPrice
          : cost;
      return value - cost;
    },

    profitLossPercent: (holding) => {
      const cost = holding.quantity * holding.averageCost;
      const value =
        holding.currentPrice > 0
          ? holding.quantity * holding.currentPrice
          : cost;
      const pl = value - cost;
      return cost > 0 ? (pl / cost) * 100 : 0;
    },

    sentiment: async (holding) => {
      return await SentimentData.findOne({ ticker: holding.ticker }).sort({
        calculatedAt: -1,
      });
    },

    priceHistory: async (holding) => {
      return [];
    },
  },

  Mutation: {
    updateUserPreferences: async (
      _,
      { alertThreshold, emailEnabled },
      context
    ) => {
      try {
        const userId = getUserId(context);

        const update = {};
        if (alertThreshold !== undefined) {
          update["preferences.alertThreshold"] = alertThreshold;
        }
        if (emailEnabled !== undefined) {
          update["preferences.emailEnabled"] = emailEnabled;
        }

        const user = await User.findByIdAndUpdate(
          userId,
          { $set: update },
          { new: true }
        ).select("-passwordHash");

        return user;
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to update preferences", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    refreshHoldingPrice: async (_, { id }, context) => {
      try {
        const userId = getUserId(context);

        const holding = await Holding.findById(id);
        if (!holding) {
          throw new GraphQLError("Holding not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const portfolio = await Portfolio.findOne({
          _id: holding.portfolioId,
          userId,
        });

        if (!portfolio) {
          throw new GraphQLError("Access denied", {
            extensions: { code: "FORBIDDEN" },
          });
        }

        const priceUpdateService = await import(
          "../../services/priceUpdateService.js"
        );
        const updated = await priceUpdateService.default.updateHoldingPrice(id);

        return updated;
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to refresh price", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    refreshPortfolioPrices: async (_, { id }, context) => {
      try {
        const userId = getUserId(context);

        const portfolio = await Portfolio.findOne({ _id: id, userId });
        if (!portfolio) {
          throw new GraphQLError("Portfolio not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const priceUpdateService = await import(
          "../../services/priceUpdateService.js"
        );
        await priceUpdateService.default.updatePortfolioPrices(id);

        return await Portfolio.findById(id);
      } catch (err) {
        if (err instanceof GraphQLError) throw err;
        throw new GraphQLError("Failed to refresh portfolio prices", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },
  },
};
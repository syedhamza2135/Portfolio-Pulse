import User from '../../models/user.js';
import Portfolio from '../../models/portfolio.js';
import Holding from '../../models/holdings.js';
import SentimentData from '../../models/sentimentData.js';
import RiskMetrics from '../../models/riskMetrics.js';
import { GraphQLError } from 'graphql';

// Helper to check authentication
function requireAuth(context) {
  if (!context.user) {
    throw new GraphQLError('You must be logged in', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
  return context.user;
}

// Helper to get user ID
function getUserId(context) {
  const user = requireAuth(context);
  return user.sub || user._id || user.id;
}

export default {
  Query: {
    // User queries
    me: async (_, __, context) => {
      const userId = getUserId(context);
      return await User.findById(userId).select('-passwordHash');
    },

    // Portfolio queries
    portfolio: async (_, { id }, context) => {
      const userId = getUserId(context);
      
      const portfolio = await Portfolio.findOne({ _id: id, userId });
      
      if (!portfolio) {
        throw new GraphQLError('Portfolio not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }
      
      return portfolio;
    },

    portfolios: async (_, { filter }, context) => {
      const userId = getUserId(context);
      
      const query = { userId };
      if (filter?.name) {
        query.name = { $regex: filter.name, $options: 'i' };
      }
      
      return await Portfolio.find(query).sort({ createdAt: 1 });
    },

    // THE MAIN USE CASE - Dashboard data in one query!
    dashboardData: async (_, __, context) => {
      const userId = getUserId(context);
      
      // Fetch all data in parallel
      const [user, portfolios] = await Promise.all([
        User.findById(userId).select('-passwordHash'),
        Portfolio.find({ userId }).sort({ createdAt: 1 })
      ]);

      // Get all holdings for user's portfolios
      const portfolioIds = portfolios.map(p => p._id);
      const holdings = await Holding.find({ 
        portfolioId: { $in: portfolioIds } 
      }).sort({ createdAt: 1 });

      // Calculate overall stats
      let totalInvestment = 0;
      let currentValue = 0;
      
      holdings.forEach(h => {
        const cost = h.quantity * h.averageCost;
        totalInvestment += cost;
        currentValue += h.currentPrice > 0 
          ? h.quantity * h.currentPrice 
          : cost;
      });

      const totalProfitLoss = currentValue - totalInvestment;
      const totalProfitLossPercent = totalInvestment > 0 
        ? (totalProfitLoss / totalInvestment) * 100 
        : 0;

      // Get top gainers/losers
      const holdingsWithPL = holdings
        .filter(h => h.currentPrice > 0)
        .map(h => {
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
          totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
          portfoliosWithHoldings: portfolioIds.length,
          lastUpdated: new Date().toISOString()
        },
        recentActivity: [], // TODO: Implement activity tracking
        topGainers: holdingsWithPL.slice(0, 5),
        topLosers: holdingsWithPL.slice(-5).reverse()
      };
    },

    // Holdings queries
    holding: async (_, { id }, context) => {
      const userId = getUserId(context);
      
      const holding = await Holding.findById(id);
      if (!holding) {
        throw new GraphQLError('Holding not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      // Verify ownership through portfolio
      const portfolio = await Portfolio.findOne({ 
        _id: holding.portfolioId, 
        userId 
      });
      
      if (!portfolio) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      return holding;
    },

    holdings: async (_, { filter }, context) => {
      const userId = getUserId(context);

      if (!filter.portfolioId) {
        throw new GraphQLError('portfolioId is required', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      // Verify ownership
      const portfolio = await Portfolio.findOne({ 
        _id: filter.portfolioId, 
        userId 
      });
      
      if (!portfolio) {
        throw new GraphQLError('Portfolio not found or access denied', {
          extensions: { code: 'FORBIDDEN' }
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
    },

    // Stats queries
    portfolioStats: async (_, { portfolioId }, context) => {
      const userId = getUserId(context);

      if (portfolioId) {
        // Stats for specific portfolio
        const portfolio = await Portfolio.findOne({ 
          _id: portfolioId, 
          userId 
        });
        
        if (!portfolio) {
          throw new GraphQLError('Portfolio not found', {
            extensions: { code: 'NOT_FOUND' }
          });
        }

        const holdings = await Holding.find({ portfolioId });
        
        let totalInvestment = 0;
        let currentValue = 0;
        
        holdings.forEach(h => {
          const cost = h.quantity * h.averageCost;
          totalInvestment += cost;
          currentValue += h.currentPrice > 0 
            ? h.quantity * h.currentPrice 
            : cost;
        });

        const totalProfitLoss = currentValue - totalInvestment;
        const totalProfitLossPercent = totalInvestment > 0 
          ? (totalProfitLoss / totalInvestment) * 100 
          : 0;

        return {
          totalPortfolios: 1,
          totalHoldings: holdings.length,
          totalInvestment: Math.round(totalInvestment * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
          totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
          portfoliosWithHoldings: holdings.length > 0 ? 1 : 0,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Stats for all user's portfolios (reuse existing controller logic)
        const portfolios = await Portfolio.find({ userId });
        const portfolioIds = portfolios.map(p => p._id);
        const holdings = await Holding.find({ 
          portfolioId: { $in: portfolioIds } 
        });

        let totalInvestment = 0;
        let currentValue = 0;
        
        holdings.forEach(h => {
          const cost = h.quantity * h.averageCost;
          totalInvestment += cost;
          currentValue += h.currentPrice > 0 
            ? h.quantity * h.currentPrice 
            : cost;
        });

        const totalProfitLoss = currentValue - totalInvestment;
        const totalProfitLossPercent = totalInvestment > 0 
          ? (totalProfitLoss / totalInvestment) * 100 
          : 0;

        return {
          totalPortfolios: portfolios.length,
          totalHoldings: holdings.length,
          totalInvestment: Math.round(totalInvestment * 100) / 100,
          currentValue: Math.round(currentValue * 100) / 100,
          totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
          totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
          portfoliosWithHoldings: portfolioIds.length,
          lastUpdated: new Date().toISOString()
        };
      }
    },

    // Price query
    tickerPrice: async (_, { ticker, assetType }) => {
      // This would call your existing price fetcher service
      const priceFetcher = await import('../../services/priceFetcherService.js');
      
      try {
        const price = await priceFetcher.default.fetchPrice(
          ticker.toUpperCase(), 
          assetType
        );

        return {
          ticker: ticker.toUpperCase(),
          price,
          change: 0, // TODO: Calculate from previous close
          changePercent: 0,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        throw new GraphQLError(`Failed to fetch price for ${ticker}`, {
          extensions: { code: 'EXTERNAL_API_ERROR' }
        });
      }
    }
  },

  // Field resolvers for nested data
  Portfolio: {
    holdings: async (portfolio) => {
      return await Holding.find({ portfolioId: portfolio._id });
    },

    riskMetrics: async (portfolio) => {
      return await RiskMetrics.findOne({ portfolioId: portfolio._id })
        .sort({ calculatedAt: -1 });
    },

    stats: async (portfolio) => {
      const holdings = await Holding.find({ portfolioId: portfolio._id });
      
      let totalInvestment = 0;
      let currentValue = 0;
      
      holdings.forEach(h => {
        const cost = h.quantity * h.averageCost;
        totalInvestment += cost;
        currentValue += h.currentPrice > 0 
          ? h.quantity * h.currentPrice 
          : cost;
      });

      const totalProfitLoss = currentValue - totalInvestment;
      const totalProfitLossPercent = totalInvestment > 0 
        ? (totalProfitLoss / totalInvestment) * 100 
        : 0;

      return {
        totalPortfolios: 1,
        totalHoldings: holdings.length,
        totalInvestment: Math.round(totalInvestment * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
        totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
        portfoliosWithHoldings: holdings.length > 0 ? 1 : 0,
        lastUpdated: new Date().toISOString()
      };
    }
  },

  Holding: {
    // Calculated fields
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
      const value = holding.currentPrice > 0 
        ? holding.quantity * holding.currentPrice 
        : cost;
      return value - cost;
    },

    profitLossPercent: (holding) => {
      const cost = holding.quantity * holding.averageCost;
      const value = holding.currentPrice > 0 
        ? holding.quantity * holding.currentPrice 
        : cost;
      const pl = value - cost;
      return cost > 0 ? (pl / cost) * 100 : 0;
    },

    // Nested data
    sentiment: async (holding) => {
      return await SentimentData.findOne({ ticker: holding.ticker })
        .sort({ calculatedAt: -1 });
    },

    priceHistory: async (holding) => {
      // TODO: Implement price history collection
      return [];
    }
  },

  Mutation: {
    updateUserPreferences: async (_, { alertThreshold, emailEnabled }, context) => {
      const userId = getUserId(context);
      
      const update = {};
      if (alertThreshold !== undefined) {
        update['preferences.alertThreshold'] = alertThreshold;
      }
      if (emailEnabled !== undefined) {
        update['preferences.emailEnabled'] = emailEnabled;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: update },
        { new: true }
      ).select('-passwordHash');

      return user;
    },

    refreshHoldingPrice: async (_, { id }, context) => {
      const userId = getUserId(context);
      
      // Verify ownership
      const holding = await Holding.findById(id);
      if (!holding) {
        throw new GraphQLError('Holding not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      const portfolio = await Portfolio.findOne({ 
        _id: holding.portfolioId, 
        userId 
      });
      
      if (!portfolio) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      // Call existing service
      const priceUpdateService = await import('../../services/priceUpdateService.js');
      const updated = await priceUpdateService.default.updateHoldingPrice(id);

      return updated;
    },

    refreshPortfolioPrices: async (_, { id }, context) => {
      const userId = getUserId(context);
      
      // Verify ownership
      const portfolio = await Portfolio.findOne({ _id: id, userId });
      if (!portfolio) {
        throw new GraphQLError('Portfolio not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      // Call existing service
      const priceUpdateService = await import('../../services/priceUpdateService.js');
      await priceUpdateService.default.updatePortfolioPrices(id);

      // Return updated portfolio with holdings
      return await Portfolio.findById(id);
    }
  }
};
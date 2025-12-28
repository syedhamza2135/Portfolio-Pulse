import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import User from '../models/user.js';
import {
  recalculatePortfolioValues,
  recalculateAllUserPortfolios,
  getPortfolioValueSummary
} from '../services/portfolioCalculation.js';
import 'dotenv/config';

jest.setTimeout(20000);

describe('Portfolio Calculation Service', () => {
  let testUser;
  let testPortfolio;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);
  });

  beforeEach(async () => {
    // Clean database
    await User.deleteMany({});
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});

    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      passwordHash: 'hashed_password',
    });

    // Create test portfolio
    testPortfolio = await Portfolio.create({
      userId: testUser._id,
      name: 'Test Portfolio',
      totalValue: 0,
      dailyChange: 0,
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('recalculatePortfolioValues', () => {
    it('should calculate values for portfolio with holdings', async () => {
      // Create holdings
      await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'AAPL',
          assetType: 'stock',
          quantity: 10,
          averageCost: 150,
          currentPrice: 175,
        },
        {
          portfolioId: testPortfolio._id,
          ticker: 'GOOGL',
          assetType: 'stock',
          quantity: 5,
          averageCost: 2800,
          currentPrice: 2900,
        },
      ]);

      const result = await recalculatePortfolioValues(testPortfolio._id);

      // AAPL: 1500 cost, 1750 value
      // GOOGL: 14000 cost, 14500 value
      // Total: 15500 cost, 16250 value, 750 P/L
      expect(result.totalInvestment).toBe(15500);
      expect(result.totalValue).toBe(16250);
      expect(result.dailyChange).toBe(750);
      expect(result.holdingCount).toBe(2);

      // Verify portfolio was updated in database
      const updatedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(updatedPortfolio.totalValue).toBe(16250);
      expect(updatedPortfolio.dailyChange).toBe(750);
      expect(updatedPortfolio.lastUpdated).toBeDefined();
    });

    it('should handle portfolio with no holdings', async () => {
      const result = await recalculatePortfolioValues(testPortfolio._id);

      expect(result.totalValue).toBe(0);
      expect(result.dailyChange).toBe(0);
      expect(result.totalInvestment).toBe(0);
      expect(result.holdingCount).toBe(0);

      const updatedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(updatedPortfolio.totalValue).toBe(0);
      expect(updatedPortfolio.dailyChange).toBe(0);
    });

    it('should use averageCost when currentPrice is 0', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'TEST',
        assetType: 'stock',
        quantity: 10,
        averageCost: 100,
        currentPrice: 0, // No price set
      });

      const result = await recalculatePortfolioValues(testPortfolio._id);

      expect(result.totalInvestment).toBe(1000);
      expect(result.totalValue).toBe(1000); // Uses averageCost
      expect(result.dailyChange).toBe(0); // No change
    });

    it('should calculate negative profit/loss', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'LOSS',
        assetType: 'stock',
        quantity: 10,
        averageCost: 200,
        currentPrice: 150, // Loss
      });

      const result = await recalculatePortfolioValues(testPortfolio._id);

      expect(result.totalInvestment).toBe(2000);
      expect(result.totalValue).toBe(1500);
      expect(result.dailyChange).toBe(-500);
    });

    it('should round values to 2 decimal places', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'FRAC',
        assetType: 'stock',
        quantity: 3.333,
        averageCost: 99.999,
        currentPrice: 100.001,
      });

      const result = await recalculatePortfolioValues(testPortfolio._id);

      // Check values are rounded to cents
      expect(result.totalValue % 0.01).toBeLessThan(0.001);
      expect(result.dailyChange % 0.01).toBeLessThan(0.001);
      expect(result.totalInvestment % 0.01).toBeLessThan(0.001);
    });

    it('should update lastUpdated timestamp', async () => {
      const beforeTime = new Date();

      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      });

      await recalculatePortfolioValues(testPortfolio._id);

      const updatedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(updatedPortfolio.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should handle large numbers correctly', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'BRK.A',
        assetType: 'stock',
        quantity: 100,
        averageCost: 500000,
        currentPrice: 525000,
      });

      const result = await recalculatePortfolioValues(testPortfolio._id);

      expect(result.totalInvestment).toBe(50000000);
      expect(result.totalValue).toBe(52500000);
      expect(result.dailyChange).toBe(2500000);
    });

    it('should handle mixed profit and loss holdings', async () => {
      await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'WINNER',
          assetType: 'stock',
          quantity: 10,
          averageCost: 100,
          currentPrice: 150, // +500
        },
        {
          portfolioId: testPortfolio._id,
          ticker: 'LOSER',
          assetType: 'stock',
          quantity: 10,
          averageCost: 200,
          currentPrice: 180, // -200
        },
      ]);

      const result = await recalculatePortfolioValues(testPortfolio._id);

      expect(result.totalInvestment).toBe(3000);
      expect(result.totalValue).toBe(3300);
      expect(result.dailyChange).toBe(300); // Net profit
    });
  });

  describe('recalculateAllUserPortfolios', () => {
    it('should recalculate all portfolios for a user', async () => {
      // Create second portfolio
      const portfolio2 = await Portfolio.create({
        userId: testUser._id,
        name: 'Second Portfolio',
        totalValue: 0,
        dailyChange: 0,
      });

      // Add holdings to both portfolios
      await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'AAPL',
          assetType: 'stock',
          quantity: 10,
          averageCost: 150,
          currentPrice: 175,
        },
        {
          portfolioId: portfolio2._id,
          ticker: 'GOOGL',
          assetType: 'stock',
          quantity: 5,
          averageCost: 2800,
          currentPrice: 2900,
        },
      ]);

      const results = await recalculateAllUserPortfolios(testUser._id);

      expect(results).toHaveLength(2);
      expect(results[0].totalValue).toBe(1750); // AAPL
      expect(results[1].totalValue).toBe(14500); // GOOGL

      // Verify both portfolios were updated
      const p1 = await Portfolio.findById(testPortfolio._id);
      const p2 = await Portfolio.findById(portfolio2._id);

      expect(p1.totalValue).toBe(1750);
      expect(p2.totalValue).toBe(14500);
    });

    it('should handle user with no portfolios', async () => {
      const newUser = await User.create({
        email: 'empty@example.com',
        passwordHash: 'hashed',
      });

      const results = await recalculateAllUserPortfolios(newUser._id);

      expect(results).toHaveLength(0);
    });

    it('should handle portfolios with no holdings', async () => {
      const results = await recalculateAllUserPortfolios(testUser._id);

      expect(results).toHaveLength(1);
      expect(results[0].totalValue).toBe(0);
      expect(results[0].dailyChange).toBe(0);
    });

    it('should not affect other users portfolios', async () => {
      // Create another user with portfolio
      const otherUser = await User.create({
        email: 'other@example.com',
        passwordHash: 'hashed',
      });

      const otherPortfolio = await Portfolio.create({
        userId: otherUser._id,
        name: 'Other Portfolio',
        totalValue: 1000, // Set initial value
        dailyChange: 100,
      });

      // Recalculate testUser portfolios
      await recalculateAllUserPortfolios(testUser._id);

      // Other user's portfolio should not change
      const unchangedPortfolio = await Portfolio.findById(otherPortfolio._id);
      expect(unchangedPortfolio.totalValue).toBe(1000);
      expect(unchangedPortfolio.dailyChange).toBe(100);
    });
  });

  describe('getPortfolioValueSummary', () => {
    it('should return value summary without updating database', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      });

      // Get initial portfolio state
      const initialPortfolio = await Portfolio.findById(testPortfolio._id);
      const initialValue = initialPortfolio.totalValue;
      const initialUpdated = initialPortfolio.lastUpdated;

      // Get summary
      const summary = await getPortfolioValueSummary(testPortfolio._id);

      expect(summary.totalInvestment).toBe(1500);
      expect(summary.currentValue).toBe(1750);
      expect(summary.profitLoss).toBe(250);
      expect(summary.profitLossPercent).toBe(16.67);
      expect(summary.totalHoldings).toBe(1);
      expect(summary.holdingsWithCurrentPrice).toBe(1);
      expect(summary.needsPriceUpdate).toBe(false);

      // Verify portfolio was NOT updated in database
      const unchangedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(unchangedPortfolio.totalValue).toBe(initialValue);
      expect(unchangedPortfolio.lastUpdated).toEqual(initialUpdated);
    });

    it('should identify holdings needing price updates', async () => {
      await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'AAPL',
          assetType: 'stock',
          quantity: 10,
          averageCost: 150,
          currentPrice: 175,
        },
        {
          portfolioId: testPortfolio._id,
          ticker: 'GOOGL',
          assetType: 'stock',
          quantity: 5,
          averageCost: 2800,
          currentPrice: 0, // Needs update
        },
      ]);

      const summary = await getPortfolioValueSummary(testPortfolio._id);

      expect(summary.totalHoldings).toBe(2);
      expect(summary.holdingsWithCurrentPrice).toBe(1);
      expect(summary.needsPriceUpdate).toBe(true);
    });

    it('should calculate percentage correctly', async () => {
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'TEST',
        assetType: 'stock',
        quantity: 10,
        averageCost: 100,
        currentPrice: 120, // 20% gain
      });

      const summary = await getPortfolioValueSummary(testPortfolio._id);

      expect(summary.profitLossPercent).toBe(20);
    });

    it('should handle zero investment', async () => {
      // Empty portfolio
      const summary = await getPortfolioValueSummary(testPortfolio._id);

      expect(summary.totalInvestment).toBe(0);
      expect(summary.currentValue).toBe(0);
      expect(summary.profitLoss).toBe(0);
      expect(summary.profitLossPercent).toBe(0);
      expect(summary.needsPriceUpdate).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent portfolio', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        recalculatePortfolioValues(fakeId)
      ).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      // Save current connection state
      const wasConnected = mongoose.connection.readyState === 1;
      
      // Close connection to simulate error
      await mongoose.connection.close();

      await expect(
        recalculatePortfolioValues(testPortfolio._id)
      ).rejects.toThrow();

      // Reconnect for other tests if it was connected before
      if (wasConnected) {
        await mongoose.connect(process.env.MONGO_URI);
      }
    });
  });

  describe('Integration with Holdings CRUD', () => {
    it('should recalculate after creating holding', async () => {
      // Initial state
      let portfolio = await Portfolio.findById(testPortfolio._id);
      expect(portfolio.totalValue).toBe(0);

      // Create holding
      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      });

      // Manually trigger recalculation (would be automatic in actual API)
      await recalculatePortfolioValues(testPortfolio._id);

      // Check updated value
      portfolio = await Portfolio.findById(testPortfolio._id);
      expect(portfolio.totalValue).toBe(1750);
      expect(portfolio.dailyChange).toBe(250);
    });

    it('should recalculate after updating holding', async () => {
      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      });

      await recalculatePortfolioValues(testPortfolio._id);

      let portfolio = await Portfolio.findById(testPortfolio._id);
      expect(portfolio.totalValue).toBe(1750);

      // Update holding
      holding.currentPrice = 200;
      await holding.save();

      await recalculatePortfolioValues(testPortfolio._id);

      portfolio = await Portfolio.findById(testPortfolio._id);
      expect(portfolio.totalValue).toBe(2000);
      expect(portfolio.dailyChange).toBe(500);
    });

    it('should recalculate after deleting holding', async () => {
      const holding1 = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      });

      await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'GOOGL',
        assetType: 'stock',
        quantity: 5,
        averageCost: 2800,
        currentPrice: 2900,
      });

      await recalculatePortfolioValues(testPortfolio._id);

      let portfolio = await Portfolio.findById(testPortfolio._id);
      const initialValue = portfolio.totalValue;

      // Delete one holding
      await holding1.deleteOne();

      await recalculatePortfolioValues(testPortfolio._id);

      portfolio = await Portfolio.findById(testPortfolio._id);
      expect(portfolio.totalValue).toBeLessThan(initialValue);
      expect(portfolio.totalValue).toBe(14500); // Only GOOGL remains
    });
  });
});
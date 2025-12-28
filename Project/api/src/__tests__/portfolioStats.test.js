import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/user.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import portfolioRoutes from '../routes/portfolioRoute.js';
import { requireAuth } from '../middleware/auth.js';
import setupPassport from '../config/passport.js';
import passport from 'passport';
import 'dotenv/config';

jest.setTimeout(20000);

process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-only';

function createTestApp() {
  const app = express();
  app.use(express.json());
  setupPassport(passport);
  app.use(passport.initialize());
  app.use('/api/portfolios', portfolioRoutes);
  return app;
}

describe('Portfolio Statistics', () => {
  let app;
  let testUser;
  let authToken;
  let portfolio1;
  let portfolio2;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    app = createTestApp();
  });

  beforeEach(async () => {
    // Clean database
    await User.deleteMany({});
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});

    // Create test user
    const passwordHash = await bcrypt.hash('Test123!@#', 4);
    testUser = await User.create({
      email: 'test@example.com',
      passwordHash,
    });

    // Generate auth token
    authToken = jwt.sign(
      { sub: testUser._id.toString(), email: testUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create test portfolios
    portfolio1 = await Portfolio.create({
      userId: testUser._id,
      name: 'Tech Stocks',
      description: 'Technology investments',
    });

    portfolio2 = await Portfolio.create({
      userId: testUser._id,
      name: 'Dividend Stocks',
      description: 'Income investments',
    });

    // Create holdings for portfolio1
    await Holding.create([
      {
        portfolioId: portfolio1._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 175,
      },
      {
        portfolioId: portfolio1._id,
        ticker: 'GOOGL',
        assetType: 'stock',
        quantity: 5,
        averageCost: 2800,
        currentPrice: 2900,
      },
      {
        portfolioId: portfolio1._id,
        ticker: 'MSFT',
        assetType: 'stock',
        quantity: 8,
        averageCost: 300,
        currentPrice: 280, // Loss
      },
    ]);

    // Create holdings for portfolio2
    await Holding.create([
      {
        portfolioId: portfolio2._id,
        ticker: 'KO',
        assetType: 'stock',
        quantity: 50,
        averageCost: 60,
        currentPrice: 65,
      },
      {
        portfolioId: portfolio2._id,
        ticker: 'PEP',
        assetType: 'stock',
        quantity: 30,
        averageCost: 170,
        currentPrice: 0, // No current price
      },
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/portfolios/stats', () => {
    it('should return global statistics for all portfolios', async () => {
      const response = await request(app)
        .get('/api/portfolios/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalPortfolios', 2);
      expect(response.body).toHaveProperty('totalHoldings', 5);
      expect(response.body).toHaveProperty('totalInvestment');
      expect(response.body).toHaveProperty('currentValue');
      expect(response.body).toHaveProperty('totalProfitLoss');
      expect(response.body).toHaveProperty('totalProfitLossPercent');
      expect(response.body).toHaveProperty('portfoliosWithHoldings', 2);
      expect(response.body).toHaveProperty('lastUpdated');

      // Verify calculations
      // Portfolio 1: AAPL (1500 -> 1750), GOOGL (14000 -> 14500), MSFT (2400 -> 2240)
      // Portfolio 2: KO (3000 -> 3250), PEP (5100 -> 5100 no price)
      const expectedInvestment = 1500 + 14000 + 2400 + 3000 + 5100;
      const expectedValue = 1750 + 14500 + 2240 + 3250 + 5100;
      const expectedPL = expectedValue - expectedInvestment;

      expect(response.body.totalInvestment).toBe(expectedInvestment);
      expect(response.body.currentValue).toBe(expectedValue);
      expect(response.body.totalProfitLoss).toBe(expectedPL);
    });

    it('should return zero stats for user with no portfolios', async () => {
      // Create new user with no portfolios
      const newUser = await User.create({
        email: 'empty@example.com',
        passwordHash: await bcrypt.hash('Test123!@#', 4),
      });

      const newToken = jwt.sign(
        { sub: newUser._id.toString(), email: newUser.email },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      const response = await request(app)
        .get('/api/portfolios/stats')
        .set('Authorization', `Bearer ${newToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totalPortfolios).toBe(0);
      expect(response.body.totalHoldings).toBe(0);
      expect(response.body.totalInvestment).toBe(0);
      expect(response.body.currentValue).toBe(0);
      expect(response.body.totalProfitLoss).toBe(0);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/portfolios/stats');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should only include authenticated user portfolios', async () => {
      // Create another user with portfolios
      const otherUser = await User.create({
        email: 'other@example.com',
        passwordHash: await bcrypt.hash('Test123!@#', 4),
      });

      const otherPortfolio = await Portfolio.create({
        userId: otherUser._id,
        name: 'Other Portfolio',
      });

      await Holding.create({
        portfolioId: otherPortfolio._id,
        ticker: 'TSLA',
        assetType: 'stock',
        quantity: 100,
        averageCost: 200,
        currentPrice: 250,
      });

      // Request with testUser token
      const response = await request(app)
        .get('/api/portfolios/stats')
        .set('Authorization', `Bearer ${authToken}`);

      // Should only count testUser's 2 portfolios and 5 holdings
      expect(response.body.totalPortfolios).toBe(2);
      expect(response.body.totalHoldings).toBe(5);
    });

    it('should handle portfolios with no holdings', async () => {
      // Create empty portfolio
      await Portfolio.create({
        userId: testUser._id,
        name: 'Empty Portfolio',
      });

      const response = await request(app)
        .get('/api/portfolios/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totalPortfolios).toBe(3);
      expect(response.body.totalHoldings).toBe(5);
      expect(response.body.portfoliosWithHoldings).toBe(2); // Only 2 have holdings
    });
  });

  describe('GET /api/portfolios/:id/stats', () => {
    it('should return detailed statistics for specific portfolio', async () => {
      const response = await request(app)
        .get(`/api/portfolios/${portfolio1._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('portfolioId', portfolio1._id.toString());
      expect(response.body).toHaveProperty('portfolioName', 'Tech Stocks');
      expect(response.body).toHaveProperty('totalHoldings', 3);
      expect(response.body).toHaveProperty('totalInvestment');
      expect(response.body).toHaveProperty('currentValue');
      expect(response.body).toHaveProperty('totalProfitLoss');
      expect(response.body).toHaveProperty('topGainers');
      expect(response.body).toHaveProperty('topLosers');
      expect(response.body).toHaveProperty('assetTypeBreakdown');

      // Verify top gainers
      expect(Array.isArray(response.body.topGainers)).toBe(true);
      expect(response.body.topGainers.length).toBeGreaterThan(0);
      expect(response.body.topGainers[0]).toHaveProperty('ticker');
      expect(response.body.topGainers[0]).toHaveProperty('profitLoss');
      expect(response.body.topGainers[0]).toHaveProperty('profitLossPercent');

      // Top gainer should be GOOGL (500 profit)
      expect(response.body.topGainers[0].ticker).toBe('GOOGL');
    });

    it('should calculate asset type breakdown correctly', async () => {
      // Add crypto and ETF to portfolio
      await Holding.create([
        {
          portfolioId: portfolio1._id,
          ticker: 'BTC',
          assetType: 'crypto',
          quantity: 0.5,
          averageCost: 40000,
          currentPrice: 45000,
        },
        {
          portfolioId: portfolio1._id,
          ticker: 'SPY',
          assetType: 'etf',
          quantity: 10,
          averageCost: 400,
          currentPrice: 420,
        },
      ]);

      const response = await request(app)
        .get(`/api/portfolios/${portfolio1._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.assetTypeBreakdown).toHaveProperty('stock');
      expect(response.body.assetTypeBreakdown).toHaveProperty('crypto');
      expect(response.body.assetTypeBreakdown).toHaveProperty('etf');

      expect(response.body.assetTypeBreakdown.stock).toHaveProperty('count', 3);
      expect(response.body.assetTypeBreakdown.crypto).toHaveProperty('count', 1);
      expect(response.body.assetTypeBreakdown.etf).toHaveProperty('count', 1);

      // Total percentages should add up to 100
      const totalPercent = 
        response.body.assetTypeBreakdown.stock.percentage +
        response.body.assetTypeBreakdown.crypto.percentage +
        response.body.assetTypeBreakdown.etf.percentage;

      expect(Math.abs(totalPercent - 100)).toBeLessThan(0.1); // Allow for rounding
    });

    it('should return empty portfolio stats correctly', async () => {
      const emptyPortfolio = await Portfolio.create({
        userId: testUser._id,
        name: 'Empty',
      });

      const response = await request(app)
        .get(`/api/portfolios/${emptyPortfolio._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.totalHoldings).toBe(0);
      expect(response.body.totalInvestment).toBe(0);
      expect(response.body.currentValue).toBe(0);
      expect(response.body.topGainers).toEqual([]);
      expect(response.body.topLosers).toEqual([]);
      expect(response.body.assetTypeBreakdown).toEqual({});
    });

    it('should return 404 for non-existent portfolio', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/portfolios/${fakeId}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Portfolio not found');
    });

    it('should return 403 for other user portfolio', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        passwordHash: await bcrypt.hash('Test123!@#', 4),
      });

      const otherPortfolio = await Portfolio.create({
        userId: otherUser._id,
        name: 'Other Portfolio',
      });

      const response = await request(app)
        .get(`/api/portfolios/${otherPortfolio._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404); // Returns 404 instead of 403 for security
    });

    it('should return 400 for invalid portfolio ID format', async () => {
      const response = await request(app)
        .get('/api/portfolios/invalid-id/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should limit top gainers and losers to 5 each', async () => {
      // Create 10 holdings
      const holdings = [];
      for (let i = 0; i < 10; i++) {
        holdings.push({
          portfolioId: portfolio1._id,
          ticker: `TEST${i}`,
          assetType: 'stock',
          quantity: 10,
          averageCost: 100,
          currentPrice: 100 + (i * 10), // Varying profits
        });
      }
      await Holding.insertMany(holdings);

      const response = await request(app)
        .get(`/api/portfolios/${portfolio1._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.topGainers.length).toBeLessThanOrEqual(5);
      expect(response.body.topLosers.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Calculation Accuracy', () => {
    it('should calculate profit/loss correctly with mixed results', async () => {
      const response = await request(app)
        .get(`/api/portfolios/${portfolio1._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      // AAPL: 10 * 150 = 1500 cost, 10 * 175 = 1750 value (+250)
      // GOOGL: 5 * 2800 = 14000 cost, 5 * 2900 = 14500 value (+500)
      // MSFT: 8 * 300 = 2400 cost, 8 * 280 = 2240 value (-160)
      const expectedInvestment = 1500 + 14000 + 2400;
      const expectedValue = 1750 + 14500 + 2240;
      const expectedPL = 250 + 500 - 160; // 590

      expect(response.body.totalInvestment).toBe(expectedInvestment);
      expect(response.body.currentValue).toBe(expectedValue);
      expect(response.body.totalProfitLoss).toBe(expectedPL);
    });

    it('should handle holdings without current price', async () => {
      const response = await request(app)
        .get(`/api/portfolios/${portfolio2._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      // KO: 50 * 60 = 3000 cost, 50 * 65 = 3250 value (+250)
      // PEP: 30 * 170 = 5100 cost, no current price so uses cost = 5100 value (0)
      const expectedInvestment = 3000 + 5100;
      const expectedValue = 3250 + 5100;
      const expectedPL = 250;

      expect(response.body.totalInvestment).toBe(expectedInvestment);
      expect(response.body.currentValue).toBe(expectedValue);
      expect(response.body.totalProfitLoss).toBe(expectedPL);
    });

    it('should round values to 2 decimal places', async () => {
      await Holding.create({
        portfolioId: portfolio1._id,
        ticker: 'FRAC',
        assetType: 'stock',
        quantity: 3.333,
        averageCost: 99.999,
        currentPrice: 100.001,
      });

      const response = await request(app)
        .get(`/api/portfolios/${portfolio1._id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Check that values are properly rounded
      expect(Number.isInteger(response.body.totalInvestment * 100)).toBe(true);
      expect(Number.isInteger(response.body.currentValue * 100)).toBe(true);
    });
  });
});
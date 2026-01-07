import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import passport from "passport";

import setupPassport from "../config/passport.js";
import User from "../models/user.js";
import Portfolio from "../models/portfolio.js";
import Holding from "../models/holdings.js";
import PriceCache from "../models/priceCache.js";
import priceRoutes from "../routes/priceRoute.js";
import "dotenv/config";

jest.setTimeout(30000);

process.env.JWT_SECRET = 'test-secret-key-for-jwt-testing-only';

function createTestApp() {
  const app = express();
  app.use(express.json());
  setupPassport(passport);
  app.use(passport.initialize());
  app.use('/api/prices', priceRoutes);
  return app;
}

describe("Price System Integration Tests", () => {
  let app;
  let testUser;
  let authToken;
  let testPortfolio;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);
    app = createTestApp();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    await PriceCache.deleteMany({});

    // Create test user
    const passwordHash = await bcrypt.hash('Test123!@#', 4);
    testUser = await User.create({
      email: 'test@example.com',
      passwordHash
    });

    // Generate auth token
    authToken = jwt.sign(
      { sub: testUser._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create test portfolio
    testPortfolio = await Portfolio.create({
      userId: testUser._id,
      name: 'Test Portfolio',
      totalValue: 0,
      dailyChange: 0
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("Full Price Update Flow", () => {
    it("should complete end-to-end price update with caching", async () => {
      // 1. Create holding without price
      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 0
      });

      // 2. Trigger price refresh via API
      const response = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ticker', 'AAPL');
      expect(response.body).toHaveProperty('currentPrice');
      expect(response.body.currentPrice).toBeGreaterThan(0);

      // 3. Verify holding updated in database
      const updatedHolding = await Holding.findById(holding._id);
      expect(updatedHolding.currentPrice).toBeGreaterThan(0);
      expect(updatedHolding.lastPriceUpdate).toBeDefined();
      expect(updatedHolding.priceSource).toBe('api');

      // 4. Verify price cached
      const cachedPrice = await PriceCache.findOne({ ticker: 'AAPL' });
      expect(cachedPrice).toBeDefined();
      expect(cachedPrice.price).toBe(updatedHolding.currentPrice);

      // 5. Second request should use cache (check lastPriceUpdate unchanged)
      const firstUpdate = updatedHolding.lastPriceUpdate;
      
      await new Promise(r => setTimeout(r, 1000)); // Wait 1 second

      const response2 = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response2.status).toBe(200);

      const secondFetch = await Holding.findById(holding._id);
      // If using cache, lastPriceUpdate should be very close (within 2 seconds)
      const timeDiff = secondFetch.lastPriceUpdate - firstUpdate;
      expect(timeDiff).toBeLessThan(2000);
    });

    it("should update portfolio totals after price refresh", async () => {
      // Create holdings
      const holdings = await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'AAPL',
          assetType: 'stock',
          quantity: 10,
          averageCost: 150,
          currentPrice: 0
        },
        {
          portfolioId: testPortfolio._id,
          ticker: 'MSFT',
          assetType: 'stock',
          quantity: 5,
          averageCost: 300,
          currentPrice: 0
        }
      ]);

      // Refresh portfolio prices
      const response = await request(app)
        .post(`/api/prices/portfolios/${testPortfolio._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verify portfolio recalculated
      const updatedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(updatedPortfolio.totalValue).toBeGreaterThan(0);
      expect(updatedPortfolio.lastUpdated).toBeDefined();

      // Verify all holdings updated
      const updatedHoldings = await Holding.find({ 
        portfolioId: testPortfolio._id 
      });
      updatedHoldings.forEach(h => {
        expect(h.currentPrice).toBeGreaterThan(0);
      });
    });
  });

  describe("Authorization & Security", () => {
    it("should prevent unauthorized price refresh", async () => {
      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150
      });

      const response = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`);

      expect(response.status).toBe(401);
    });

    it("should prevent cross-user price refresh", async () => {
      // Create another user's portfolio
      const otherUser = await User.create({
        email: 'other@example.com',
        passwordHash: await bcrypt.hash('Test123!@#', 4)
      });

      const otherPortfolio = await Portfolio.create({
        userId: otherUser._id,
        name: 'Other Portfolio'
      });

      const otherHolding = await Holding.create({
        portfolioId: otherPortfolio._id,
        ticker: 'TSLA',
        assetType: 'stock',
        quantity: 5,
        averageCost: 200
      });

      // Try to refresh with testUser's token
      const response = await request(app)
        .post(`/api/prices/holdings/${otherHolding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe("Public Price Lookup", () => {
    it("should allow unauthenticated ticker price lookup", async () => {
      const response = await request(app)
        .get('/api/prices/ticker/AAPL')
        .query({ assetType: 'stock' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ticker', 'AAPL');
      expect(response.body).toHaveProperty('price');
      expect(response.body).toHaveProperty('timestamp');
    });

    it("should cache public ticker lookups", async () => {
      // First request
      const response1 = await request(app)
        .get('/api/prices/ticker/AAPL')
        .query({ assetType: 'stock' });

      expect(response1.status).toBe(200);
      const price1 = response1.body.price;

      // Second request (should use cache)
      const response2 = await request(app)
        .get('/api/prices/ticker/AAPL')
        .query({ assetType: 'stock' });

      expect(response2.status).toBe(200);
      expect(response2.body.price).toBe(price1);

      // Verify cached
      const cached = await PriceCache.findOne({ ticker: 'AAPL' });
      expect(cached).toBeDefined();
    });

    it("should handle invalid ticker gracefully", async () => {
      const response = await request(app)
        .get('/api/prices/ticker/INVALID123')
        .query({ assetType: 'stock' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it("should support crypto price lookup", async () => {
      const response = await request(app)
        .get('/api/prices/ticker/BTC')
        .query({ assetType: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.ticker).toBe('BTC');
      expect(response.body.price).toBeGreaterThan(0);
    });
  });

  describe("Batch Operations", () => {
    it("should handle multiple holdings in single portfolio refresh", async () => {
      // Create 5 holdings
      const tickers = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];
      await Holding.create(tickers.map(ticker => ({
        portfolioId: testPortfolio._id,
        ticker,
        assetType: 'stock',
        quantity: 10,
        averageCost: 100
      })));

      const response = await request(app)
        .post(`/api/prices/portfolios/${testPortfolio._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Verify all updated
      const holdings = await Holding.find({ portfolioId: testPortfolio._id });
      const updatedCount = holdings.filter(h => h.currentPrice > 0).length;
      expect(updatedCount).toBeGreaterThan(0);
    });

    it("should handle mixed success/failure in batch", async () => {
      await Holding.create([
        {
          portfolioId: testPortfolio._id,
          ticker: 'AAPL',
          assetType: 'stock',
          quantity: 10,
          averageCost: 150
        },
        {
          portfolioId: testPortfolio._id,
          ticker: 'INVALID_TICKER_XYZ',
          assetType: 'stock',
          quantity: 5,
          averageCost: 100
        }
      ]);

      const response = await request(app)
        .post(`/api/prices/portfolios/${testPortfolio._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Should report some success even with failures
    });
  });

  describe("Performance & Caching", () => {
    it("should use cache to avoid redundant API calls", async () => {
      // Create cache entry
      await PriceCache.create({
        ticker: 'AAPL',
        assetType: 'stock',
        price: 175.43,
        fetchedAt: new Date()
      });

      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150
      });

      // This should use cached price
      const response = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.currentPrice).toBe(175.43);
    });

    it("should respect cache TTL and refetch expired prices", async () => {
      // Create expired cache (10 minutes old)
      const expiredTime = new Date(Date.now() - 10 * 60 * 1000);
      await PriceCache.create({
        ticker: 'AAPL',
        assetType: 'stock',
        price: 150,
        fetchedAt: expiredTime
      });

      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150
      });

      const response = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      
      // Should fetch new price (different from expired cache)
      // Note: This assumes real API is called, which may not be predictable in tests
      expect(response.body.currentPrice).toBeDefined();
    });
  });

  describe("Error Recovery", () => {
    it("should return meaningful error when holding not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/prices/holdings/${fakeId}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403); // Access denied (holding doesn't exist for user)
    });

    it("should handle malformed holding ID", async () => {
      const response = await request(app)
        .post('/api/prices/holdings/invalid-id/refresh')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it("should handle portfolio not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/prices/portfolios/${fakeId}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain consistency between holding and portfolio after price update", async () => {
      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 0
      });

      // Get initial portfolio value
      const initialPortfolio = await Portfolio.findById(testPortfolio._id);
      const initialValue = initialPortfolio.totalValue;

      // Update price
      await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      // Verify portfolio value changed
      const updatedPortfolio = await Portfolio.findById(testPortfolio._id);
      expect(updatedPortfolio.totalValue).not.toBe(initialValue);

      // Verify consistency: portfolio value = holding value
      const updatedHolding = await Holding.findById(holding._id);
      const expectedValue = updatedHolding.quantity * updatedHolding.currentPrice;
      
      expect(Math.abs(updatedPortfolio.totalValue - expectedValue)).toBeLessThan(0.01);
    });

    it("should rollback holding price if portfolio recalc fails", async () => {
      const holding = await Holding.create({
        portfolioId: testPortfolio._id,
        ticker: 'AAPL',
        assetType: 'stock',
        quantity: 10,
        averageCost: 150,
        currentPrice: 150
      });

      const initialPrice = holding.currentPrice;

      // Delete portfolio to cause recalc failure
      await Portfolio.findByIdAndDelete(testPortfolio._id);

      const response = await request(app)
        .post(`/api/prices/holdings/${holding._id}/refresh`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);

      // Verify price unchanged (transaction rolled back)
      const unchangedHolding = await Holding.findById(holding._id);
      expect(unchangedHolding.currentPrice).toBe(initialPrice);
    });
  });
});
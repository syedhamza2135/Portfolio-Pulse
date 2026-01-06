import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";

// 1. Mock Auth
jest.unstable_mockModule("../utils/authHelpers.js", () => ({
  getUserId: jest.fn(),
}));

const { getUserId } = await import("../utils/authHelpers.js");
const { 
  getPortfolioStats, 
  getPortfolioDetailedStats 
} = await import("../controllers/portfolioStatsController.js");

const Portfolio = (await import("../models/portfolio.js")).default;
const Holding = (await import("../models/holdings.js")).default;

const app = express();
app.use(express.json());
app.get("/api/stats", getPortfolioStats);
app.get("/api/stats/:id", getPortfolioDetailedStats);

describe("Stats Controller", () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  beforeEach(async () => {
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    getUserId.mockReturnValue(mockUserId);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("GET /api/stats (Global Stats)", () => {
    it("should return zeroed-out stats if no portfolios exist", async () => {
      const res = await request(app).get("/api/stats");
      expect(res.status).toBe(200);
      expect(res.body.totalPortfolios).toBe(0);
      expect(res.body.totalInvestment).toBe(0);
    });

    it("should correctly aggregate data from multiple portfolios", async () => {
      // Setup: Create 2 portfolios
      const p1 = await Portfolio.create({ name: "Crypto", userId: mockUserId });
      const p2 = await Portfolio.create({ name: "Stocks", userId: mockUserId });

      // Setup: Add Holdings
      // P1: 1 BTC at 40k cost, 50k current (Gain 10k)
      await Holding.create({
        portfolioId: p1._id,
        ticker: "BTC",
        assetType: "crypto",
        quantity: 1,
        averageCost: 40000,
        currentPrice: 50000
      });

      // P2: 10 AAPL at 150 cost, 140 current (Loss 100)
      await Holding.create({
        portfolioId: p2._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
        currentPrice: 140
      });

      const res = await request(app).get("/api/stats");

      expect(res.status).toBe(200);
      expect(res.body.totalPortfolios).toBe(2);
      expect(res.body.portfoliosWithHoldings).toBe(2);
      
      // Math: (1*40000) + (10*150) = 41500
      expect(res.body.totalInvestment).toBe(41500);
      
      // Math: (1*50000) + (10*140) = 51400
      expect(res.body.currentValue).toBe(51400);
      
      // Math: 51400 - 41500 = 9900
      expect(res.body.totalProfitLoss).toBe(9900);
    });
  });

  describe("GET /api/stats/:id (Detailed Stats)", () => {
    it("should calculate asset type breakdown and gainers/losers", async () => {
      const p = await Portfolio.create({ name: "Mixed", userId: mockUserId });

      // A Gainer
      await Holding.create({
        portfolioId: p._id,
        ticker: "BTC",
        assetType: "crypto",
        quantity: 1,
        averageCost: 30000,
        currentPrice: 40000
      });

      // A Loser
      await Holding.create({
        portfolioId: p._id,
        ticker: "ETH",
        assetType: "crypto",
        quantity: 2,
        averageCost: 3000,
        currentPrice: 2000
      });

      const res = await request(app).get(`/api/stats/${p._id}`);

      expect(res.status).toBe(200);
      expect(res.body.portfolioName).toBe("Mixed");
      
      // Check Asset Breakdown
      expect(res.body.assetTypeBreakdown.crypto.count).toBe(2);
      
      // Check Top Gainers (BTC should be first)
      expect(res.body.topGainers[0].ticker).toBe("BTC");
      expect(res.body.topGainers[0].profitLoss).toBe(10000);
      
      // Check Top Losers (ETH should be in losers)
      expect(res.body.topLosers[0].ticker).toBe("ETH");
    });

    it("should return 404 for a portfolio that doesn't belong to the user", async () => {
      const otherUserPort = await Portfolio.create({ 
        name: "Private", 
        userId: new mongoose.Types.ObjectId() 
      });

      const res = await request(app).get(`/api/stats/${otherUserPort._id}`);
      expect(res.status).toBe(404);
    });
  });
});
import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";

// 1. Mock Auth and Services BEFORE imports
jest.unstable_mockModule("../utils/authHelpers.js", () => ({ getUserId: jest.fn() }));
jest.unstable_mockModule("../services/priceUpdateService.js", () => ({
  default: {
    updateHoldingPrice: jest.fn(),
    updatePortfolioPrices: jest.fn(),
  }
}));
jest.unstable_mockModule("../services/priceFetcherService.js", () => ({
  default: { fetchPrice: jest.fn() }
}));

const { getUserId } = await import("../utils/authHelpers.js");
const priceUpdateService = (await import("../services/priceUpdateService.js")).default;
const priceFetcher = (await import("../services/priceFetcherService.js")).default;

const { 
  refreshHoldingPrice, 
  refreshPortfolioPrices, 
  getTickerPrice 
} = await import("../controllers/priceController.js");

const Portfolio = (await import("../models/portfolio.js")).default;
const Holding = (await import("../models/holdings.js")).default;

const app = express();
app.use(express.json());
app.post("/api/prices/holding/:id", refreshHoldingPrice);
app.post("/api/prices/portfolio/:id", refreshPortfolioPrices);
app.get("/api/prices/ticker/:ticker", getTickerPrice);

describe("Price Controller", () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGO_URI);
  });

  beforeEach(async () => {
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    getUserId.mockReturnValue(mockUserId);
  });

  afterAll(async () => await mongoose.connection.close());

  describe("POST /api/prices/holding/:id", () => {
    it("should refresh price for a valid holding owned by user", async () => {
      const p = await Portfolio.create({ name: "Crypto", userId: mockUserId });
      const h = await Holding.create({
        portfolioId: p._id, ticker: "BTC", assetType: "crypto", quantity: 1, averageCost: 30000
      });

      priceUpdateService.updateHoldingPrice.mockResolvedValue({
        ticker: "BTC",
        currentPrice: 45000,
        lastPriceUpdate: new Date()
      });

      const res = await request(app).post(`/api/prices/holding/${h._id}`);

      expect(res.status).toBe(200);
      expect(res.body.currentPrice).toBe(45000);
    });

    it("should return 403 if user tries to refresh someone else's holding", async () => {
      const otherUser = new mongoose.Types.ObjectId().toString();
      const p = await Portfolio.create({ name: "Secret", userId: otherUser });
      const h = await Holding.create({
        portfolioId: p._id, ticker: "BTC", assetType: "crypto", quantity: 1, averageCost: 1
      });

      const res = await request(app).post(`/api/prices/holding/${h._id}`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/prices/portfolio/:id", () => {
    it("should refresh all prices in a portfolio", async () => {
      const p = await Portfolio.create({ name: "Main", userId: mockUserId });
      
      priceUpdateService.updatePortfolioPrices.mockResolvedValue({
        updatedCount: 5,
        failedCount: 0
      });

      const res = await request(app).post(`/api/prices/portfolio/${p._id}`);

      expect(res.status).toBe(200);
      expect(res.body.updatedCount).toBe(5);
      expect(res.body.message).toContain("successfully");
    });
  });

  describe("GET /api/prices/ticker/:ticker", () => {
    it("should fetch current market price for any ticker", async () => {
      priceFetcher.fetchPrice.mockResolvedValue(150.25);

      const res = await request(app).get("/api/prices/ticker/AAPL?assetType=stock");

      expect(res.status).toBe(200);
      expect(res.body.ticker).toBe("AAPL");
      expect(res.body.price).toBe(150.25);
    });

    it("should return 404 if ticker is not found by service", async () => {
      priceFetcher.fetchPrice.mockRejectedValue(new Error("Ticker not found"));

      const res = await request(app).get("/api/prices/ticker/INVALID");
      expect(res.status).toBe(404);
    });
  });
});
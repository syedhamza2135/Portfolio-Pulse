import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";

// 1. Mock Auth and Calculation Service
jest.unstable_mockModule("../utils/authHelpers.js", () => ({
  getUserId: jest.fn(),
}));
jest.unstable_mockModule("../services/portfolioCalculation.js", () => ({
  recalculatePortfolioValues: jest.fn().mockResolvedValue(true),
}));

const { getUserId } = await import("../utils/authHelpers.js");
const { recalculatePortfolioValues } = await import(
  "../services/portfolioCalculation.js"
);

const {
  getHoldings,
  getHoldingbyID,
  createHolding,
  updateHolding,
  deleteHolding,
} = await import("../controllers/holdingsController.js");

const Portfolio = (await import("../models/portfolio.js")).default;
const Holding = (await import("../models/holdings.js")).default;

const app = express();
app.use(express.json());
app.get("/api/holdings", getHoldings);
app.get("/api/holdings/:id", getHoldingbyID);
app.post("/api/holdings", createHolding);
app.put("/api/holdings/:id", updateHolding);
app.delete("/api/holdings/:id", deleteHolding);

describe("Holding Controller", () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  let testPortfolioId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0)
      await mongoose.connect(process.env.MONGO_URI);
  });

  beforeEach(async () => {
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    getUserId.mockReturnValue(mockUserId);
    recalculatePortfolioValues.mockClear();

    const p = await Portfolio.create({
      name: "Main Portfolio",
      userId: mockUserId,
    });
    testPortfolioId = p._id.toString();
  });

  afterAll(async () => await mongoose.connection.close());

  describe("POST /api/holdings", () => {
    it("should create a holding successfully", async () => {
      const res = await request(app).post("/api/holdings").send({
        portfolioId: testPortfolioId,
        ticker: "aapl",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
      });
      expect(res.status).toBe(201);
      expect(res.body.ticker).toBe("AAPL");
    });

    it("should return 409 if ticker already exists in portfolio", async () => {
      // Use 'stock' instead of 'commodity' to satisfy your Mongoose Enum
      await Holding.create({
        portfolioId: testPortfolioId,
        ticker: "GOLD",
        assetType: "stock",
        quantity: 1,
        averageCost: 2000,
      });

      const res = await request(app).post("/api/holdings").send({
        portfolioId: testPortfolioId,
        ticker: "GOLD",
        assetType: "stock",
        quantity: 5,
        averageCost: 2100,
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it("should return 400 for invalid portfolio ID format", async () => {
      const res = await request(app).post("/api/holdings").send({
        portfolioId: "invalid-id", // Joi catches this first
        ticker: "BTC",
        assetType: "crypto",
        quantity: 1,
        averageCost: 50000,
      });
      expect(res.status).toBe(400);
      // Update this to match what Joi actually sends
      expect(res.body.error).toMatch(/portfolioId/);
    });
  });

  describe("GET /api/holdings/:id", () => {
    it("should return 404 if holding does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/holdings/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it("should return 403 if user tries to access another user's holding", async () => {
      const otherUser = new mongoose.Types.ObjectId();
      const otherPort = await Portfolio.create({
        name: "Other",
        userId: otherUser,
      });
      const h = await Holding.create({
        portfolioId: otherPort._id,
        ticker: "TSLA",
        assetType: "stock",
        quantity: 1,
        averageCost: 200,
      });

      const res = await request(app).get(`/api/holdings/${h._id}`);
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/holdings/:id", () => {
    it("should delete a holding and update the portfolio", async () => {
      const h = await Holding.create({
        portfolioId: testPortfolioId,
        ticker: "ETH",
        assetType: "crypto",
        quantity: 1,
        averageCost: 2000,
      });

      const res = await request(app).delete(`/api/holdings/${h._id}`);

      expect(res.status).toBe(204);

      // FIXED EXPECTATION: Compare by converting the ID to string
      const callArgs = recalculatePortfolioValues.mock.calls[0];
      expect(callArgs[0].toString()).toBe(testPortfolioId);
    });
  });

  describe("GET /api/holdings (Query Parameter)", () => {
    it("should return 400 if portfolioId query param is missing", async () => {
      const res = await request(app).get("/api/holdings");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });
  });

  describe("PUT /api/holdings/:id", () => {
    let holdingId;

    beforeEach(async () => {
      const h = await Holding.create({
        portfolioId: testPortfolioId,
        ticker: "MSFT",
        assetType: "stock",
        quantity: 5,
        averageCost: 300,
        currentPrice: 310,
      });
      holdingId = h._id.toString();
    });

    it("should update holding quantity and trigger recalculation", async () => {
      const res = await request(app)
        .put(`/api/holdings/${holdingId}`)
        .send({ quantity: 10 });

      expect(res.status).toBe(200);
      expect(res.body.quantity).toBe(10);
      expect(recalculatePortfolioValues).toHaveBeenCalled();
    });

    it("should update lastPriceUpdate when currentPrice is changed", async () => {
      const res = await request(app)
        .put(`/api/holdings/${holdingId}`)
        .send({ currentPrice: 325 });

      expect(res.status).toBe(200);
      expect(res.body.currentPrice).toBe(325);

      // Verify lastPriceUpdate is now a valid date and not null
      expect(res.body.lastPriceUpdate).toBeDefined();
      const updateTime = new Date(res.body.lastPriceUpdate).getTime();
      expect(isNaN(updateTime)).toBe(false);

      // Verify it's recent (within the last 10 seconds)
      expect(updateTime).toBeGreaterThan(Date.now() - 10000);
    });

    it("should return 403 when trying to update a holding owned by another user", async () => {
      const otherUser = new mongoose.Types.ObjectId();
      const otherPort = await Portfolio.create({
        name: "Not Mine",
        userId: otherUser,
      });
      const otherHolding = await Holding.create({
        portfolioId: otherPort._id,
        ticker: "TSLA",
        assetType: "stock",
        quantity: 1,
        averageCost: 200,
      });

      const res = await request(app)
        .put(`/api/holdings/${otherHolding._id}`)
        .send({ quantity: 2 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Access denied");
    });

    it("should return 400 for invalid update data (Joi validation)", async () => {
      const res = await request(app)
        .put(`/api/holdings/${holdingId}`)
        .send({ quantity: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
});
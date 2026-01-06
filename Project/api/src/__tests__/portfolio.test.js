import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";

// 1. Mock the Auth Helper before other imports
jest.unstable_mockModule("../utils/authHelpers.js", () => ({
  getUserId: jest.fn(),
}));

// 2. Dynamic Imports
const { getUserId } = await import("../utils/authHelpers.js");
const {
  getPortfolios,
  createPortfolio,
  getPortfoliobyID,
  updatePortfolio,
  deletePortfolio,
} = await import("../controllers/portfolioController.js");

const Portfolio = (await import("../models/portfolio.js")).default;
const Holding = (await import("../models/holdings.js")).default;

// 3. App Setup
const app = express();
app.use(express.json());
app.get("/api/portfolios", getPortfolios);
app.get("/api/portfolios/:id", getPortfoliobyID);
app.post("/api/portfolios", createPortfolio);
app.put("/api/portfolios/:id", updatePortfolio);
app.delete("/api/portfolios/:id", deletePortfolio);

describe("Portfolio Controller - Comprehensive Tests", () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const otherUserId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  beforeEach(async () => {
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    getUserId.mockClear();
    getUserId.mockReturnValue(mockUserId); // Default to our main test user
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("GET /api/portfolios", () => {
    it("should return only portfolios belonging to the logged-in user", async () => {
      await Portfolio.create([
        { name: "User Portfolio 1", userId: mockUserId },
        { name: "User Portfolio 2", userId: mockUserId },
        { name: "Other Portfolio", userId: otherUserId },
      ]);

      const res = await request(app).get("/api/portfolios");
      const names = res.body.map((p) => p.name);
      expect(names).toContain("User Portfolio 1");
      expect(names).toContain("User Portfolio 2");
      expect(names).not.toContain("Other Portfolio");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /api/portfolios/:id", () => {
    it("should return portfolio with holdings", async () => {
      const portfolio = await Portfolio.create({
        name: "Main",
        userId: mockUserId,
      });
      await Holding.create({
        portfolioId: portfolio._id,
        ticker: "BTC",
        assetType: "crypto",
        quantity: 1,
        averageCost: 40000,
      });

      const res = await request(app).get(`/api/portfolios/${portfolio._id}`);
      expect(res.status).toBe(200);
      expect(res.body.holdings).toHaveLength(1);
      expect(res.body.holdings[0].ticker).toBe("BTC");
    });

    it("should return 404 if user tries to access someone else's portfolio", async () => {
      const otherPort = await Portfolio.create({
        name: "Secret",
        userId: otherUserId,
      });
      const res = await request(app).get(`/api/portfolios/${otherPort._id}`);
      expect(res.status).toBe(404);
    });

    it("should return 400 for malformed MongoDB IDs", async () => {
      const res = await request(app).get("/api/portfolios/not-a-valid-id");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid portfolio ID format");
    });
  });

  describe("POST /api/portfolios", () => {
    it("should create a portfolio with valid data", async () => {
      const res = await request(app)
        .post("/api/portfolios")
        .send({ name: "Growth Strategy", description: "Tech stocks" });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(mockUserId);
    });

    it("should return 400 if validation fails (e.g., missing name)", async () => {
      const res = await request(app).post("/api/portfolios").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/portfolios/:id", () => {
    it("should update user's own portfolio", async () => {
      const portfolio = await Portfolio.create({
        name: "Old Name",
        userId: mockUserId,
      });
      const res = await request(app)
        .put(`/api/portfolios/${portfolio._id}`)
        .send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("New Name");
    });

    it("should fail to update portfolio belonging to another user", async () => {
      const otherPort = await Portfolio.create({
        name: "Other",
        userId: otherUserId,
      });
      const res = await request(app)
        .put(`/api/portfolios/${otherPort._id}`)
        .send({ name: "Hacked" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/portfolios/:id", () => {
    it("should delete portfolio and all associated holdings (Cascade)", async () => {
      const portfolio = await Portfolio.create({
        name: "To Liquidate",
        userId: mockUserId,
      });
      await Holding.create({
        portfolioId: portfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
      });

      const res = await request(app).delete(`/api/portfolios/${portfolio._id}`);
      expect(res.status).toBe(204);

      // Verify cascading delete
      const holdCount = await Holding.countDocuments({
        portfolioId: portfolio._id,
      });
      expect(holdCount).toBe(0);
    });

    it("should abort and return 404 if portfolio doesn't exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).delete(`/api/portfolios/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });
});

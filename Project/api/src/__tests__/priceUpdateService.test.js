import { jest } from "@jest/globals";
import mongoose from "mongoose";

// 1. Mock Dependencies
jest.unstable_mockModule("../services/priceFetcherService.js", () => ({
  default: {
    fetchPrice: jest.fn(),
    fetchBatchPrices: jest.fn()
  }
}));
jest.unstable_mockModule("../services/portfolioCalculation.js", () => ({
  recalculatePortfolioValues: jest.fn().mockResolvedValue(true)
}));

const priceFetcher = (await import("../services/priceFetcherService.js")).default;
const { recalculatePortfolioValues } = await import("../services/portfolioCalculation.js");
const Holding = (await import("../models/holdings.js")).default;
const priceUpdateService = (await import("../services/priceUpdateService.js")).default;

describe("PriceUpdateService", () => {
  const mockPortfolioId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGO_URI);
  });

  beforeEach(async () => {
    await Holding.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => await mongoose.connection.close());

  describe("updateHoldingPrice", () => {
    it("should update a single holding price and trigger recalculation", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolioId,
        ticker: "BTC",
        assetType: "crypto",
        quantity: 1,
        averageCost: 40000
      });

      priceFetcher.fetchPrice.mockResolvedValue(45000);

      const result = await priceUpdateService.updateHoldingPrice(holding._id);

      expect(result.currentPrice).toBe(45000);
      expect(result.priceSource).toBe('api');
      expect(recalculatePortfolioValues).toHaveBeenCalledWith(mockPortfolioId);
    });

    it("should throw a specific error if rate limited", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolioId, ticker: "AAPL", assetType: "stock", quantity: 1, averageCost: 150
      });

      priceFetcher.fetchPrice.mockRejectedValue(new Error("API rate limit exceeded"));

      await expect(priceUpdateService.updateHoldingPrice(holding._id))
        .rejects.toThrow(/Price update temporarily unavailable/);
    });
  });

  describe("updatePortfolioPrices", () => {
    it("should update multiple holdings using batch fetch", async () => {
      await Holding.create([
        { portfolioId: mockPortfolioId, ticker: "MSFT", assetType: "stock", quantity: 5, averageCost: 300 },
        { portfolioId: mockPortfolioId, ticker: "GOOGL", assetType: "stock", quantity: 2, averageCost: 2500 }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({
        "MSFT": 310,
        "GOOGL": 2600
      });

      const result = await priceUpdateService.updatePortfolioPrices(mockPortfolioId);

      expect(result.updated).toBe(2);
      expect(recalculatePortfolioValues).toHaveBeenCalledTimes(1);
      
      const updatedMsft = await Holding.findOne({ ticker: "MSFT" });
      expect(updatedMsft.currentPrice).toBe(310);
    });

    it("should handle partial failures in batch updates", async () => {
      await Holding.create({
        portfolioId: mockPortfolioId, ticker: "INVALID", assetType: "stock", quantity: 1, averageCost: 10
      });

      priceFetcher.fetchBatchPrices.mockResolvedValue({ "INVALID": null });

      const result = await priceUpdateService.updatePortfolioPrices(mockPortfolioId);
      expect(result.failed).toBe(1);
      expect(result.updated).toBe(0);
    });
  });

  describe("updateAllPrices (Bulk Update)", () => {
    it("should use bulkWrite for efficiency and update all portfolios", async () => {
      const port1 = new mongoose.Types.ObjectId();
      const port2 = new mongoose.Types.ObjectId();

      await Holding.create([
        { portfolioId: port1, ticker: "TSLA", assetType: "stock", quantity: 1, averageCost: 200 },
        { portfolioId: port2, ticker: "TSLA", assetType: "stock", quantity: 5, averageCost: 180 }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({ "TSLA": 250 });

      const result = await priceUpdateService.updateAllPrices();

      expect(result.updated).toBe(1); // 1 unique ticker
      expect(recalculatePortfolioValues).toHaveBeenCalledTimes(2); // 2 different portfolios
      
      const holdings = await Holding.find({ ticker: "TSLA" });
      holdings.forEach(h => expect(h.currentPrice).toBe(250));
    });
  });
});
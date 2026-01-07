import { jest } from "@jest/globals";
import mongoose from "mongoose";

// Mock Dependencies
jest.unstable_mockModule("../services/priceFetcherService.js", () => ({
  default: {
    fetchPrice: jest.fn(),
    fetchBatchPrices: jest.fn()
  },
  PriceNotFoundError: class PriceNotFoundError extends Error {
    constructor(ticker) {
      super(`Price not found for ${ticker}`);
      this.name = 'PriceNotFoundError';
    }
  },
  RateLimitError: class RateLimitError extends Error {
    constructor(message) {
      super(message);
      this.name = 'RateLimitError';
    }
  }
}));

jest.unstable_mockModule("../services/portfolioCalculation.js", () => ({
  recalculatePortfolioValues: jest.fn().mockResolvedValue({
    totalValue: 10000,
    dailyChange: 500
  })
}));

const priceFetcher = (await import("../services/priceFetcherService.js")).default;
const { PriceNotFoundError, RateLimitError } = await import("../services/priceFetcherService.js");
const { recalculatePortfolioValues } = await import("../services/portfolioCalculation.js");
const Holding = (await import("../models/holdings.js")).default;
const Portfolio = (await import("../models/portfolio.js")).default;
const priceUpdateService = (await import("../services/priceUpdateService.js")).default;

describe("PriceUpdateService - Comprehensive Tests", () => {
  const mockUserId = new mongoose.Types.ObjectId();
  let mockPortfolio;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  beforeEach(async () => {
    await Portfolio.deleteMany({});
    await Holding.deleteMany({});
    jest.clearAllMocks();

    // Create test portfolio
    mockPortfolio = await Portfolio.create({
      userId: mockUserId,
      name: "Test Portfolio",
      totalValue: 0,
      dailyChange: 0
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("updateHoldingPrice - WITH TRANSACTIONS", () => {
    it("should update price and recalculate within transaction", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
        currentPrice: 0
      });

      priceFetcher.fetchPrice.mockResolvedValue(175.43);

      const result = await priceUpdateService.updateHoldingPrice(holding._id);

      expect(result.currentPrice).toBe(175.43);
      expect(result.priceSource).toBe('api');
      expect(result.lastPriceUpdate).toBeDefined();
      expect(recalculatePortfolioValues).toHaveBeenCalledWith(
        mockPortfolio._id,
        expect.anything() // session
      );
    });

    it("should rollback transaction on price fetch failure", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
        currentPrice: 150
      });

      const originalPrice = holding.currentPrice;
      
      priceFetcher.fetchPrice.mockRejectedValue(new Error("API Error"));

      await expect(
        priceUpdateService.updateHoldingPrice(holding._id)
      ).rejects.toThrow();

      // Verify holding price unchanged (transaction rolled back)
      const unchangedHolding = await Holding.findById(holding._id);
      expect(unchangedHolding.currentPrice).toBe(originalPrice);
      expect(recalculatePortfolioValues).not.toHaveBeenCalled();
    });

    it("should rollback transaction if recalculation fails", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150,
        currentPrice: 150
      });

      priceFetcher.fetchPrice.mockResolvedValue(175.43);
      recalculatePortfolioValues.mockRejectedValue(new Error("Recalc failed"));

      await expect(
        priceUpdateService.updateHoldingPrice(holding._id)
      ).rejects.toThrow("Recalc failed");

      // Verify price NOT updated (transaction rolled back)
      const unchangedHolding = await Holding.findById(holding._id);
      expect(unchangedHolding.currentPrice).toBe(150);
    });

    it("should throw descriptive error for rate limit", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150
      });

      priceFetcher.fetchPrice.mockRejectedValue(new RateLimitError("API limit"));

      await expect(
        priceUpdateService.updateHoldingPrice(holding._id)
      ).rejects.toThrow("Rate limit reached");
    });

    it("should throw descriptive error for price not found", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "INVALID",
        assetType: "stock",
        quantity: 10,
        averageCost: 150
      });

      priceFetcher.fetchPrice.mockRejectedValue(new PriceNotFoundError("INVALID"));

      await expect(
        priceUpdateService.updateHoldingPrice(holding._id)
      ).rejects.toThrow("Price not available");
    });

    it("should throw error for non-existent holding", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        priceUpdateService.updateHoldingPrice(fakeId)
      ).rejects.toThrow("Holding not found");

      expect(priceFetcher.fetchPrice).not.toHaveBeenCalled();
    });
  });

  describe("updatePortfolioPrices - BATCH WITH TRANSACTION", () => {
    it("should update all holdings in portfolio", async () => {
      await Holding.create([
        {
          portfolioId: mockPortfolio._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 10,
          averageCost: 150
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "MSFT",
          assetType: "stock",
          quantity: 5,
          averageCost: 300
        }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({
        AAPL: 175.43,
        MSFT: 380.25
      });

      const result = await priceUpdateService.updatePortfolioPrices(mockPortfolio._id);

      expect(result.updated).toBe(2);
      expect(result.total).toBe(2);
      expect(result.failed).toBe(0);
      expect(recalculatePortfolioValues).toHaveBeenCalledTimes(1);

      // Verify holdings updated
      const holdings = await Holding.find({ portfolioId: mockPortfolio._id });
      expect(holdings.find(h => h.ticker === "AAPL").currentPrice).toBe(175.43);
      expect(holdings.find(h => h.ticker === "MSFT").currentPrice).toBe(380.25);
    });

    it("should handle partial failures in batch", async () => {
      await Holding.create([
        {
          portfolioId: mockPortfolio._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 10,
          averageCost: 150
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "INVALID",
          assetType: "stock",
          quantity: 5,
          averageCost: 100
        }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({
        AAPL: 175.43,
        INVALID: null
      });

      const result = await priceUpdateService.updatePortfolioPrices(mockPortfolio._id);

      expect(result.updated).toBe(1);
      expect(result.failed).toBe(1);

      // Verify only AAPL was updated
      const aaplHolding = await Holding.findOne({ ticker: "AAPL" });
      expect(aaplHolding.currentPrice).toBe(175.43);

      const invalidHolding = await Holding.findOne({ ticker: "INVALID" });
      expect(invalidHolding.currentPrice).toBe(0);
    });

    it("should return zeros for empty portfolio", async () => {
      const result = await priceUpdateService.updatePortfolioPrices(mockPortfolio._id);

      expect(result.updated).toBe(0);
      expect(result.total).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should rollback on bulk write failure", async () => {
      await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150
      });

      priceFetcher.fetchBatchPrices.mockResolvedValue({ AAPL: 175.43 });

      // Mock bulkWrite to fail
      jest.spyOn(Holding, "bulkWrite").mockRejectedValue(new Error("DB Error"));

      await expect(
        priceUpdateService.updatePortfolioPrices(mockPortfolio._id)
      ).rejects.toThrow();

      // Verify holding unchanged
      const holding = await Holding.findOne({ ticker: "AAPL" });
      expect(holding.currentPrice).toBe(0);
    });
  });

  describe("updateAllPrices - GLOBAL BATCH UPDATE", () => {
    it("should update all holdings across all portfolios", async () => {
      const portfolio2 = await Portfolio.create({
        userId: new mongoose.Types.ObjectId(),
        name: "Portfolio 2"
      });

      await Holding.create([
        {
          portfolioId: mockPortfolio._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 10,
          averageCost: 150
        },
        {
          portfolioId: portfolio2._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 5,
          averageCost: 160
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "BTC",
          assetType: "crypto",
          quantity: 0.5,
          averageCost: 40000
        }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({
        AAPL: 175.43,
        BTC: 45000
      });

      const result = await priceUpdateService.updateAllPrices();

      expect(result.tickersUpdated).toBe(2);
      expect(result.holdingsModified).toBeGreaterThan(0);
      expect(result.portfoliosUpdated).toBe(2);

      // Verify both AAPL holdings updated
      const aaplHoldings = await Holding.find({ ticker: "AAPL" });
      aaplHoldings.forEach(h => {
        expect(h.currentPrice).toBe(175.43);
        expect(h.priceSource).toBe('scheduled');
      });
    });

    it("should aggregate by unique tickers before fetching", async () => {
      // Create 5 holdings with only 2 unique tickers
      await Holding.create([
        { portfolioId: mockPortfolio._id, ticker: "AAPL", assetType: "stock", quantity: 10, averageCost: 150 },
        { portfolioId: mockPortfolio._id, ticker: "AAPL", assetType: "stock", quantity: 5, averageCost: 160 },
        { portfolioId: mockPortfolio._id, ticker: "MSFT", assetType: "stock", quantity: 3, averageCost: 300 },
        { portfolioId: mockPortfolio._id, ticker: "MSFT", assetType: "stock", quantity: 2, averageCost: 320 },
        { portfolioId: mockPortfolio._id, ticker: "AAPL", assetType: "stock", quantity: 1, averageCost: 170 }
      ]);

      priceFetcher.fetchBatchPrices.mockResolvedValue({
        AAPL: 175.43,
        MSFT: 380.25
      });

      await priceUpdateService.updateAllPrices();

      // Should only call fetchBatchPrices once with 2 unique tickers
      expect(priceFetcher.fetchBatchPrices).toHaveBeenCalledTimes(1);
      expect(priceFetcher.fetchBatchPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ ticker: "AAPL" }),
          expect.objectContaining({ ticker: "MSFT" })
        ])
      );
    });

    it("should handle no holdings gracefully", async () => {
      const result = await priceUpdateService.updateAllPrices();

      expect(result.tickersUpdated).toBe(0);
      expect(result.portfoliosUpdated).toBe(0);
      expect(priceFetcher.fetchBatchPrices).not.toHaveBeenCalled();
    });

    it("should use unordered bulkWrite for performance", async () => {
      await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150
      });

      priceFetcher.fetchBatchPrices.mockResolvedValue({ AAPL: 175.43 });

      const bulkWriteSpy = jest.spyOn(Holding, "bulkWrite");

      await priceUpdateService.updateAllPrices();

      expect(bulkWriteSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ ordered: false })
      );
    });
  });

  describe("batchRecalculatePortfolios - CHUNKED PROCESSING", () => {
    it("should process portfolios in chunks", async () => {
      // Create 120 portfolios (3 chunks of 50)
      const portfolioIds = [];
      for (let i = 0; i < 120; i++) {
        const p = await Portfolio.create({
          userId: mockUserId,
          name: `Portfolio ${i}`
        });
        portfolioIds.push(p._id.toString());
      }

      const result = await priceUpdateService.batchRecalculatePortfolios(portfolioIds, 50);

      expect(result.successful).toBe(120);
      expect(result.failed).toBe(0);
      expect(recalculatePortfolioValues).toHaveBeenCalledTimes(120);
    }, 30000);

    it("should track failed recalculations", async () => {
      const p1 = await Portfolio.create({ userId: mockUserId, name: "P1" });
      const p2 = await Portfolio.create({ userId: mockUserId, name: "P2" });
      const p3 = await Portfolio.create({ userId: mockUserId, name: "P3" });

      recalculatePortfolioValues
        .mockResolvedValueOnce({ totalValue: 100 })
        .mockRejectedValueOnce(new Error("Recalc failed"))
        .mockResolvedValueOnce({ totalValue: 200 });

      const result = await priceUpdateService.batchRecalculatePortfolios([
        p1._id.toString(),
        p2._id.toString(),
        p3._id.toString()
      ]);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        portfolioId: p2._id.toString(),
        error: "Recalc failed"
      });
    });

    it("should add delay between chunks", async () => {
      const portfolioIds = [];
      for (let i = 0; i < 60; i++) {
        const p = await Portfolio.create({ userId: mockUserId, name: `P${i}` });
        portfolioIds.push(p._id.toString());
      }

      const startTime = Date.now();
      await priceUpdateService.batchRecalculatePortfolios(portfolioIds, 50);
      const elapsed = Date.now() - startTime;

      // Should have at least 100ms delay between chunks (2 chunks = 1 delay)
      expect(elapsed).toBeGreaterThanOrEqual(100);
    }, 30000);
  });

  describe("getUpdateStats - HEALTH CHECK", () => {
    it("should return comprehensive update statistics", async () => {
      await Holding.create([
        {
          portfolioId: mockPortfolio._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 10,
          averageCost: 150,
          currentPrice: 175.43,
          lastPriceUpdate: new Date()
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "MSFT",
          assetType: "stock",
          quantity: 5,
          averageCost: 300,
          currentPrice: 0 // Needs update
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "GOOGL",
          assetType: "stock",
          quantity: 2,
          averageCost: 2800
          // No lastPriceUpdate - needs update
        }
      ]);

      const stats = await priceUpdateService.getUpdateStats();

      expect(stats.totalHoldings).toBe(3);
      expect(stats.needsUpdate).toBe(2);
      expect(stats.recentUpdates).toBe(1);
      expect(stats.updateCoverage).toBe("33.33%");
    });

    it("should return zeros for no holdings", async () => {
      const stats = await priceUpdateService.getUpdateStats();

      expect(stats.totalHoldings).toBe(0);
      expect(stats.needsUpdate).toBe(0);
      expect(stats.updateCoverage).toBe("0%");
    });

    it("should count recent updates (last hour)", async () => {
      const recentTime = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      await Holding.create([
        {
          portfolioId: mockPortfolio._id,
          ticker: "AAPL",
          assetType: "stock",
          quantity: 10,
          averageCost: 150,
          currentPrice: 175,
          lastPriceUpdate: recentTime
        },
        {
          portfolioId: mockPortfolio._id,
          ticker: "MSFT",
          assetType: "stock",
          quantity: 5,
          averageCost: 300,
          currentPrice: 380,
          lastPriceUpdate: oldTime
        }
      ]);

      const stats = await priceUpdateService.getUpdateStats();

      expect(stats.recentUpdates).toBe(1); // Only AAPL updated in last hour
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("should handle concurrent updates to same holding", async () => {
      const holding = await Holding.create({
        portfolioId: mockPortfolio._id,
        ticker: "AAPL",
        assetType: "stock",
        quantity: 10,
        averageCost: 150
      });

      priceFetcher.fetchPrice.mockResolvedValue(175.43);

      // Simulate concurrent updates
      const promises = [
        priceUpdateService.updateHoldingPrice(holding._id),
        priceUpdateService.updateHoldingPrice(holding._id)
      ];

      const results = await Promise.allSettled(promises);

      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle database connection errors", async () => {
      // Close connection temporarily
      await mongoose.connection.close();

      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        priceUpdateService.updateHoldingPrice(fakeId)
      ).rejects.toThrow();

      // Reconnect for other tests
      await mongoose.connect(process.env.MONGO_URI);
    });
  });
});
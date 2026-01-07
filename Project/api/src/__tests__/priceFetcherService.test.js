import { jest } from "@jest/globals";
import axios from "axios";
import mongoose from "mongoose";

// Set a higher global timeout for the 15s rate-limit delays
jest.setTimeout(60000);

// Mock axios before importing the service
jest.unstable_mockModule("axios", () => ({
  default: {
    get: jest.fn()
  }
}));

// Import after mocking
const axiosMock = (await import("axios")).default;
const PriceCache = (await import("../models/priceCache.js")).default;
const priceFetcher = (await import("../services/priceFetcherService.js")).default;
const { PriceNotFoundError, RateLimitError } = await import("../services/priceFetcherService.js");

describe("PriceFetcherService - Comprehensive Tests", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  beforeEach(async () => {
    await PriceCache.deleteMany({});
    priceFetcher.cache.clear();
    jest.clearAllMocks();
    jest.restoreAllMocks(); // Critical to clear spies between tests
  });

  afterAll(async () => {
    priceFetcher.destroy(); 
    await mongoose.connection.close();
  });

  // HELPER: Fixes the "lean is not a function" error
  const mockFindOneLean = (dataOrError, isError = false) => {
    const queryChain = {
      lean: jest.fn().mockImplementation(() => 
        isError ? Promise.reject(dataOrError) : Promise.resolve(dataOrError)
      )
    };
    return jest.spyOn(PriceCache, "findOne").mockReturnValue(queryChain);
  };

  describe("fetchStockPrice", () => {
    it("should fetch stock price from Alpha Vantage successfully", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "175.43" } }
      });

      const price = await priceFetcher.fetchStockPrice("AAPL");
      expect(price).toBe(175.43);
    });

    it("should throw RateLimitError when API limit reached", async () => {
      axiosMock.get.mockResolvedValue({
        data: { Note: "Thank you for using Alpha Vantage!..." }
      });
      await expect(priceFetcher.fetchStockPrice("AAPL")).rejects.toThrow(RateLimitError);
    });

    it("should throw RateLimitError for Information field", async () => {
      axiosMock.get.mockResolvedValue({
        data: { Information: "The API call frequency is exceeded." }
      });
      await expect(priceFetcher.fetchStockPrice("AAPL")).rejects.toThrow(RateLimitError);
    });

    it("should throw PriceNotFoundError for invalid ticker", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Error Message": "Invalid API call" }
      });
      await expect(priceFetcher.fetchStockPrice("INVALID123")).rejects.toThrow(PriceNotFoundError);
    });

    it("should throw PriceNotFoundError when price is missing", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": {} }
      });
      await expect(priceFetcher.fetchStockPrice("AAPL")).rejects.toThrow(PriceNotFoundError);
    });

    it("should retry on rate limit with exponential backoff", async () => {
      axiosMock.get
        .mockResolvedValueOnce({ data: { Note: "Rate limit" } })
        .mockResolvedValueOnce({ data: { Note: "Rate limit" } })
        .mockResolvedValueOnce({ data: { "Global Quote": { "05. price": "175.43" } } });

      const price = await priceFetcher.fetchStockPrice("AAPL");
      expect(price).toBe(175.43);
      expect(axiosMock.get).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries exhausted", async () => {
      axiosMock.get.mockResolvedValue({ data: { Note: "Rate limit" } });
      await expect(priceFetcher.fetchStockPrice("AAPL")).rejects.toThrow(RateLimitError);
      expect(axiosMock.get).toHaveBeenCalledTimes(3);
    });

    it("should handle network errors gracefully", async () => {
      axiosMock.get.mockRejectedValue(new Error("Network error"));
      await expect(priceFetcher.fetchStockPrice("AAPL")).rejects.toThrow("Stock fetch failed");
    });
  });

  describe("fetchCryptoPrice", () => {
    it("should fetch crypto price from CoinGecko", async () => {
      axiosMock.get.mockResolvedValue({ data: { bitcoin: { usd: 45000 } } });
      const price = await priceFetcher.fetchCryptoPrice("BTC");
      expect(price).toBe(45000);
    });

    it("should map ticker symbols to CoinGecko IDs", async () => {
      axiosMock.get.mockResolvedValue({ data: { ethereum: { usd: 3000 } } });
      const price = await priceFetcher.fetchCryptoPrice("ETH");
      expect(price).toBe(3000);
    });

    it("should throw RateLimitError on 429 status", async () => {
      axiosMock.get.mockRejectedValue({ response: { status: 429 } });
      await expect(priceFetcher.fetchCryptoPrice("BTC")).rejects.toThrow(RateLimitError);
    });

    it("should throw PriceNotFoundError when coin not found", async () => {
      axiosMock.get.mockResolvedValue({ data: {} });
      await expect(priceFetcher.fetchCryptoPrice("INVALID")).rejects.toThrow(PriceNotFoundError);
    });
  });

  describe("fetchPrice (with caching)", () => {
    it("should fetch and cache stock price", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "175.43" } }
      });
      const price = await priceFetcher.fetchPrice("AAPL", "stock");
      expect(price).toBe(175.43);
      const dbCache = await PriceCache.findOne({ ticker: "AAPL" }).lean();
      expect(dbCache.price).toBe(175.43);
    });

    it("should return cached price without API call", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "175.43" } }
      });
      await priceFetcher.fetchPrice("AAPL", "stock");
      const cachedPrice = await priceFetcher.fetchPrice("AAPL", "stock");
      expect(cachedPrice).toBe(175.43);
      expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });

    it("should handle database cache errors gracefully", async () => {
      mockFindOneLean(new Error("DB Error"), true);
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "175.43" } }
      });
      const price = await priceFetcher.fetchPrice("AAPL", "stock");
      expect(price).toBe(175.43);
    });
  });

  describe("fetchBatchPrices (optimized)", () => {
    it("should check all caches before fetching", async () => {
      await PriceCache.create({
        ticker: "AAPL", assetType: "stock", price: 175.43, fetchedAt: new Date()
      });
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "380.25" } }
      });

      const results = await priceFetcher.fetchBatchPrices([
        { ticker: "AAPL", assetType: "stock" },
        { ticker: "MSFT", assetType: "stock" }
      ]);

      expect(results.AAPL).toBe(175.43);
      expect(results.MSFT).toBe(380.25);
      expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });

    it("should respect rate limits with delays", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "100" } }
      });

      const start = Date.now();
      await priceFetcher.fetchBatchPrices([
        { ticker: "AAPL", assetType: "stock" },
        { ticker: "MSFT", assetType: "stock" }
      ]);
      expect(Date.now() - start).toBeGreaterThanOrEqual(15000);
    });
  });

  describe("Cache Management", () => {
    it("should update existing DB cache entry", async () => {
      await PriceCache.create({
        ticker: "AAPL", assetType: "stock", price: 150, fetchedAt: new Date(Date.now() - 600000)
      });
      await priceFetcher.cachePrice("AAPL", 175.43, "stock");
      const dbCache = await PriceCache.findOne({ ticker: "AAPL" }).lean();
      expect(dbCache.price).toBe(175.43);
    });

    it("should not throw on DB cache write failure", async () => {
      jest.spyOn(PriceCache, "findOneAndUpdate").mockRejectedValue(new Error("DB Error"));
      await expect(priceFetcher.cachePrice("AAPL", 175.43, "stock")).resolves.not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should complete full fetch-cache-retrieve cycle", async () => {
      axiosMock.get.mockResolvedValue({
        data: { "Global Quote": { "05. price": "175.43" } }
      });

      await priceFetcher.fetchPrice("AAPL", "stock");
      await priceFetcher.fetchPrice("AAPL", "stock");
      priceFetcher.cache.clear();
      await priceFetcher.fetchPrice("AAPL", "stock");

      expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("Service Lifecycle", () => {
    it("should clean up resources on destroy", () => {
      priceFetcher.destroy();
      expect(priceFetcher.cleanupInterval).toBeNull();
      expect(priceFetcher.cache.size).toBe(0);
    });
  });
});
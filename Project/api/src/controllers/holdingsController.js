import mongoose from "mongoose";
import {
  createHoldingSchema,
  updateHoldingSchema,
} from "../validation/holding.js";
import Holding from "../models/holdings.js";
import Portfolio from "../models/portfolio.js";
import { recalculatePortfolioValues } from "../services/portfolioCalculation.js";
import { getUserId } from "../utils/authHelpers.js";

async function verifyPortfolioOwnership(portfolioId, userId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(portfolioId)) {
    throw new Error("Invalid portfolio ID format");
  }

  const queryOptions = session ? { session } : {};
  const portfolio = await Portfolio.findOne(
    { _id: portfolioId, userId },
    null,
    queryOptions
  );

  if (!portfolio) {
    throw new Error("Portfolio not found or access denied");
  }
  return portfolio;
}

async function verifyHoldingOwnership(holdingId, userId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(holdingId)) {
    throw new Error("Invalid holding ID format");
  }

  const queryOptions = session ? { session } : {};
  const holding = await Holding.findById(holdingId, null, queryOptions);

  if (!holding) {
    throw new Error("Holding not found");
  }

  const portfolio = await Portfolio.findOne(
    { _id: holding.portfolioId, userId },
    null,
    queryOptions
  );

  if (!portfolio) {
    throw new Error("Access denied");
  }

  return { holding, portfolio };
}

export async function getHoldings(req, res) {
  try {
    const { portfolioId } = req.query;

    if (!portfolioId) {
      return res
        .status(400)
        .json({ error: "portfolioId query parameter is required" });
    }

    const userId = getUserId(req);
    await verifyPortfolioOwnership(portfolioId, userId);

    const holdings = await Holding.find({ portfolioId })
      .sort({ createdAt: 1 })
      .lean();

    res.json(holdings);
  } catch (err) {
    console.error("Error fetching holdings:", err);

    if (err.message === "Portfolio not found or access denied") {
      return res.status(404).json({ error: err.message });
    }

    if (err.message === "Invalid portfolio ID format") {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: "Failed to fetch holdings" });
  }
}

export async function getHoldingbyID(req, res) {
  try {
    const userId = getUserId(req);
    const { holding } = await verifyHoldingOwnership(req.params.id, userId);
    res.json(holding);
  } catch (err) {
    console.error("Error fetching holding:", err);

    if (err.message === "Invalid holding ID format") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Holding not found") {
      return res.status(404).json({ error: err.message });
    }

    if (err.message === "Access denied") {
      return res.status(403).json({ error: err.message });
    }

    res.status(500).json({ error: "Failed to fetch holding" });
  }
}

export async function createHolding(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { error, value } = createHoldingSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      return res.status(400).json({ error: error.message });
    }

    const userId = getUserId(req);

    await verifyPortfolioOwnership(value.portfolioId, userId, session);

    value.ticker = value.ticker.toUpperCase();
    const holding = await Holding.create([value], { session });

    await recalculatePortfolioValues(value.portfolioId, session);

    await session.commitTransaction();
    res.status(201).json(holding[0]);
  } catch (err) {
    await session.abortTransaction();
    console.error("Error creating holding:", err);

    if (err.message === "Portfolio not found or access denied") {
      return res.status(404).json({ error: err.message });
    }

    if (err.message === "Invalid portfolio ID format") {
      return res.status(400).json({ error: err.message });
    }

    if (err.code === 11000) {
      return res.status(409).json({
        error: "A holding with this ticker already exists in this portfolio",
      });
    }

    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: "Failed to create holding" });
  } finally {
    session.endSession();
  }
}

export async function updateHolding(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { error, value } = updateHoldingSchema.validate(req.body);
    if (error) {
      await session.abortTransaction();
      return res.status(400).json({ error: error.message });
    }

    const userId = getUserId(req);

    const { holding } = await verifyHoldingOwnership(
      req.params.id,
      userId,
      session
    );

    Object.assign(holding, value);
    holding.updatedAt = new Date();

    if (value.currentPrice !== undefined) {
      holding.lastPriceUpdate = new Date();
    }

    await holding.save({ session });
    await recalculatePortfolioValues(holding.portfolioId, session);

    await session.commitTransaction();
    res.json(holding);
  } catch (err) {
    await session.abortTransaction();
    console.error("Error updating holding:", err);

    if (err.message === "Invalid holding ID format") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Holding not found") {
      return res.status(404).json({ error: err.message });
    }

    if (err.message === "Access denied") {
      return res.status(403).json({ error: err.message });
    }

    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: "Failed to update holding" });
  } finally {
    session.endSession();
  }
}

export async function deleteHolding(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = getUserId(req);

    const { holding } = await verifyHoldingOwnership(
      req.params.id,
      userId,
      session
    );

    const portfolioId = holding.portfolioId;
    await holding.deleteOne({ session });
    await recalculatePortfolioValues(portfolioId, session);

    await session.commitTransaction();
    res.status(204).send();
  } catch (err) {
    await session.abortTransaction();
    console.error("Error deleting holding:", err);

    if (err.message === "Invalid holding ID format") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Holding not found") {
      return res.status(404).json({ error: err.message });
    }

    if (err.message === "Access denied") {
      return res.status(403).json({ error: err.message });
    }

    res.status(500).json({ error: "Failed to delete holding" });
  } finally {
    session.endSession();
  }
}
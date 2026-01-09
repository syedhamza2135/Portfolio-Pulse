import mongoose from "mongoose";
import Portfolio from "../models/portfolio.js";
import Holding from "../models/holdings.js";
import { createPortfolioSchema, updatePortfolioSchema } from "../validation/portfolio.js";
import { getUserId } from "../utils/authHelpers.js";

const handleControllerError = (res, err, context) => {
  console.error(`[PortfolioController] ${context}:`, err);
  const status = err.status || (err.name === "CastError" ? 400 : 500);
  const message = err.message || `Failed to ${context}`;
  return res.status(status).json({ error: message });
};

export async function getPortfolios(req, res) {
  try {
    const portfolios = await Portfolio.find({ userId: getUserId(req) }).sort({ createdAt: 1 }).lean();
    res.json(portfolios);
  } catch (err) {
    handleControllerError(res, err, "fetch portfolios");
  }
}

export async function getPortfoliobyID(req, res) {
  try {
    const portfolio = await Portfolio.findOne({ _id: req.params.id, userId: getUserId(req) }).lean();
    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });

    portfolio.holdings = await Holding.find({ portfolioId: portfolio._id }).sort({ createdAt: 1 }).lean();
    res.json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "fetch portfolio");
  }
}

export async function createPortfolio(req, res) {
  try {
    const { error, value } = createPortfolioSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const portfolio = await Portfolio.create({ userId: getUserId(req), ...value });
    res.status(201).json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "create portfolio");
  }
}

export async function updatePortfolio(req, res) {
  try {
    const { error, value } = updatePortfolioSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.id, userId: getUserId(req) },
      { ...value, lastUpdated: new Date() },
      { new: true, runValidators: true }
    );

    if (!portfolio) return res.status(404).json({ error: "Portfolio not found" });
    res.json(portfolio);
  } catch (err) {
    handleControllerError(res, err, "update portfolio");
  }
}

export async function deletePortfolio(req, res) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const portfolio = await Portfolio.findOneAndDelete(
        { _id: req.params.id, userId: getUserId(req) },
        { session }
      );
      if (!portfolio) throw { status: 404, message: "Portfolio not found" };

      await Holding.deleteMany({ portfolioId: portfolio._id }, { session });
    });
    res.status(204).send();
  } catch (err) {
    handleControllerError(res, err, "delete portfolio");
  } finally {
    session.endSession();
  }
}
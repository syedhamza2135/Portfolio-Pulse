/**
 * Alert Check Background Job
 * 
 * Scheduled job that checks portfolios and holdings for alert conditions
 * and sends email notifications when thresholds are exceeded.
 * 
 * Schedule:
 * - Default: Every 15 minutes
 * - Configurable via cron schedule
 * 
 * Alert Types:
 * - Portfolio-level: Total value change exceeds user's threshold
 * - Holding-level: Individual holding price change exceeds threshold
 * 
 * Features:
 * - Cooldown periods to prevent email spam (4 hours for portfolios, 1 hour for holdings)
 * - Daily email limit enforcement (3 emails per user per day)
 * - User preference checking (respects emailEnabled setting)
 * 
 * @module jobs/alertCheckJob
 * @requires node-cron
 * @requires services/emailAlertService
 */

import cron from "node-cron";
import User from "../models/user.js";
import Portfolio from "../models/portfolio.js";
import Holding from "../models/holdings.js";
import emailAlertService from "../services/emailAlertService.js";

/**
 * Alert Checker Class
 * 
 * Manages alert checking state and prevents concurrent executions.
 */
class AlertChecker {
  constructor() {
    // Track last alert times to implement cooldown periods
    this.lastCheckedPrices = new Map();
    // Flag to prevent concurrent job executions
    this.isRunning = false;
  }

  /**
   * Checks all user portfolios for alert conditions
   * Runs every 15 minutes per PRD
   */
  async checkAllAlerts() {
    if (this.isRunning) {
      console.log("[AlertJob] Previous check still running, skipping...");
      return;
    }

    this.isRunning = true;
    console.log("[AlertJob] Starting alert check...");

    try {
      // Get all users with email alerts enabled
      const users = await User.find({
        "preferences.emailEnabled": true,
      })
        .select("_id email preferences")
        .lean();

      if (users.length === 0) {
        console.log("[AlertJob] No users with alerts enabled");
        return;
      }

      let portfolioAlertsTriggered = 0;
      let holdingAlertsTriggered = 0;

      async function delay(ms) {
        return new Promise((resolve) => {
          const timer = setTimeout(resolve, ms);
          // Prevent unhandled rejection
          timer.unref?.();
        });
      }

      // Check each user's portfolios
      for (const user of users) {
        try {
          const portfolios = await Portfolio.find({ userId: user._id }).lean();

          for (const portfolio of portfolios) {
            // Check portfolio-level threshold
            const portfolioAlertSent = await this.checkPortfolioThreshold(
              user,
              portfolio
            );
            if (portfolioAlertSent) portfolioAlertsTriggered++;

            // Check individual holdings
            const holdingAlerts = await this.checkHoldingThresholds(
              user,
              portfolio
            );
            holdingAlertsTriggered += holdingAlerts;
          }

          // Small delay between users to avoid rate limits
          await delay(500);
        } catch (error) {
          console.error(
            `[AlertJob] Error checking alerts for user ${user._id}:`,
            error.message
          );
        }
      }

      console.log(
        `[AlertJob] ✓ Complete. Portfolio alerts: ${portfolioAlertsTriggered}, Holding alerts: ${holdingAlertsTriggered}`
      );
    } catch (error) {
      console.error("[AlertJob] Critical error:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Checks if portfolio total value change exceeds user's threshold
   */
  async checkPortfolioThreshold(user, portfolio) {
    try {
      const threshold = user.preferences?.alertThreshold || 3;

      const holdings = await Holding.find({
        portfolioId: portfolio._id,
      }).lean();

      let totalInvestment = 0;
      let currentValue = 0;

      holdings.forEach((h) => {
        const cost = h.quantity * h.averageCost;
        totalInvestment += cost;
        currentValue += h.quantity * (h.currentPrice || h.averageCost);
      });

      if (totalInvestment === 0) return false;

      const changePercent =
        ((currentValue - totalInvestment) / totalInvestment) * 100;

      if (Math.abs(changePercent) >= threshold) {
        // Ttimestamp-based key with 4-hour cooldown
        const lastAlertKey = `portfolio_${portfolio._id}`;
        const lastAlertTime = this.lastCheckedPrices.get(lastAlertKey);

        const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
        const now = Date.now();

        if (!lastAlertTime || now - lastAlertTime >= COOLDOWN_MS) {
          const sent = await emailAlertService.sendPortfolioThresholdAlert(
            user._id,
            {
              ...portfolio,
              totalValue: currentValue,
              dailyChange: currentValue - totalInvestment,
              userId: user._id,
            },
            changePercent
          );

          if (sent) {
            this.lastCheckedPrices.set(lastAlertKey, now);
            console.log(`[AlertJob] ✓ Portfolio alert sent to ${user.email}`);
            return true;
          }
        } else {
          const cooldownRemaining = Math.ceil(
            (COOLDOWN_MS - (now - lastAlertTime)) / 60000
          );
          console.log(
            `[AlertJob] Alert cooldown: ${cooldownRemaining}m remaining for portfolio ${portfolio._id}`
          );
        }
      }

      return false;
    } catch (error) {
      console.error(
        "[AlertJob] Portfolio threshold check error:",
        error.message
      );
      return false;
    }
  }

  /**
   * Checks if any individual holdings exceed threshold
   */
  async checkHoldingThresholds(user, portfolio) {
    try {
      const threshold = user.preferences?.alertThreshold || 5; // Default 5% for holdings per PRD
      const holdings = await Holding.find({
        portfolioId: portfolio._id,
      }).lean();

      let alertsSent = 0;

      for (const holding of holdings) {
        // Skip holdings without current price
        if (!holding.currentPrice || holding.currentPrice <= 0) continue;

        const changePercent =
          ((holding.currentPrice - holding.averageCost) / holding.averageCost) *
          100;

        // Check if threshold exceeded
        if (Math.abs(changePercent) >= threshold) {
          // Avoid duplicate alerts
          const lastAlertKey = `holding_${holding._id}_${Math.floor(Date.now() / (60 * 60 * 1000))}`;

          if (!this.lastCheckedPrices.has(lastAlertKey)) {
            const sent = await emailAlertService.sendHoldingAlert(
              user._id,
              holding,
              changePercent
            );

            if (sent) {
              this.lastCheckedPrices.set(lastAlertKey, Date.now());
              alertsSent++;
            }
          }
        }
      }

      return alertsSent;
    } catch (error) {
      console.error("[AlertJob] Holding threshold check error:", error.message);
      return 0;
    }
  }

  /**
   * Cleans up old alert cache entries (run daily)
   */
  cleanupCache() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [key, timestamp] of this.lastCheckedPrices.entries()) {
      if (timestamp < oneHourAgo) {
        this.lastCheckedPrices.delete(key);
      }
    }
  }
}

const checker = new AlertChecker();

/**
 * Starts the alert checking cron job
 * Runs every 15 minutes per PRD
 */
/**
 * Starts the alert checking cron job
 * 
 * Schedules two jobs:
 * 1. Alert checking: Every 15 minutes (checks for threshold breaches)
 * 2. Cache cleanup: Daily at midnight (removes old alert cache entries)
 * 
 * @function startAlertCheckJob
 */
export function startAlertCheckJob() {
  // Check alerts every 15 minutes
  // This frequency balances responsiveness with system load
  cron.schedule("*/15 * * * *", async () => {
    await checker.checkAllAlerts();
  });

  // Cleanup cache daily at midnight
  // Removes old alert cache entries to prevent memory leaks
  cron.schedule("0 0 * * *", () => {
    checker.cleanupCache();
    console.log("[AlertJob] Cache cleanup complete");
  });

  console.log("✓ Alert checking job started (runs every 15 minutes)");
}

export default checker;
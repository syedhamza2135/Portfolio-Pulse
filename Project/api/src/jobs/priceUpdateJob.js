/**
 * Price Update Background Job
 * 
 * Scheduled job that updates market prices for all holdings.
 * 
 * Schedule:
 * - Default: Every 15 minutes during 14:00-20:00 UTC (9am-4pm ET) on weekdays
 * - Configurable via PRICE_UPDATE_CRON environment variable
 * - Only runs during market hours to avoid unnecessary API calls
 * 
 * Features:
 * - Failure tracking (alerts after 3 consecutive failures)
 * - Comprehensive logging
 * - Graceful error handling
 * 
 * @module jobs/priceUpdateJob
 * @requires node-cron
 * @requires services/priceUpdateService
 */

import cron from 'node-cron';
import priceUpdateService from '../services/priceUpdateService.js';

/**
 * Starts the scheduled price update job
 * 
 * The job runs on a cron schedule and updates prices for all holdings.
 * Tracks consecutive failures and alerts when manual intervention is needed.
 * 
 * Cron Schedule Format: minute hour day-of-month month day-of-week
 * Default: Every 15 minutes, 14:00-20:00 UTC, Mon-Fri
 * 
 * @function startPriceUpdateJob
 * 
 * @example
 * // Custom schedule: Every 30 minutes during market hours
 */
export function startPriceUpdateJob() {
  let consecutiveFailures = 0;
  const MAX_FAILURES = 3;  // Alert threshold for consecutive failures
  
  // Cron schedule: configurable via environment variable
  // Default: Every 15 minutes during market hours (14:00-20:00 UTC) on weekdays
  const cronSchedule = process.env.PRICE_UPDATE_CRON || '*/15 14-20 * * 1-5';
  
  // Schedule the job
  cron.schedule(cronSchedule, async () => {
    console.log('[Cron] Starting scheduled price update...');
    
    try {
      // Update all prices system-wide
      const result = await priceUpdateService.updateAllPrices();
      console.log(`[Cron] ✓ Updated ${result.tickersUpdated} tickers, ${result.portfoliosUpdated} portfolios`);
      
      // Reset failure counter on success
      consecutiveFailures = 0;
    } catch (err) {
      console.error('[Cron] Price update failed:', err);
      consecutiveFailures++;
      
      // Alert if too many consecutive failures
      // This indicates a systemic issue (API down, database issue, etc.)
      if (consecutiveFailures >= MAX_FAILURES) {
        console.error(`[Cron] ⚠️ ${MAX_FAILURES} consecutive failures - manual intervention needed`);
        // TODO: Send alert notification (email, Slack, etc.)
      }
    }
  });
  
  console.log(`✓ Price update cron job started (schedule: ${cronSchedule} UTC)`);
  console.log('  Note: Runs every 15 min during 14:00-20:00 UTC (approx 9am-4pm ET)');
}
/**
 * Risk Calculation Background Job
 * 
 * Scheduled job that calculates risk metrics for all portfolios.
 * 
 * Schedule:
 * - Default: Daily at 23:00 UTC (6:00 PM ET) after market close
 * - Configurable via RISK_CALC_CRON environment variable
 * - Runs once per day to avoid unnecessary calculations
 * 
 * Features:
 * - Processes all portfolios with holdings
 * - Comprehensive error tracking
 * - Detailed logging
 * 
 * @module jobs/riskCalculationJob
 * @requires node-cron
 * @requires services/riskScoringService
 */

import cron from 'node-cron';
import riskScoringService from '../services/riskScoringService.js';

/**
 * Starts the daily risk calculation job
 * 
 * The job runs once per day after market close to calculate risk metrics
 * for all portfolios. Risk metrics include:
 * - Overall risk score (1-10 scale)
 * - Volatility component
 * - Concentration component
 * - Sector exposure component
 * 
 * Cron Schedule Format: minute hour day-of-month month day-of-week
 * Default: '0 23 * * *' = Daily at 23:00 UTC (6:00 PM ET)
 * 
 * @function startRiskCalculationJob
 * 
 * @example
 * // Custom schedule: Run at midnight UTC
 * RISK_CALC_CRON='0 0 * * *'
 */
export function startRiskCalculationJob() {
  // Cron schedule: configurable via environment variable
  // Default: Daily at 23:00 UTC (6:00 PM ET) after market close
  const cronSchedule = process.env.RISK_CALC_CRON || '0 23 * * *';
  
  // Schedule the job
  cron.schedule(cronSchedule, async () => {
    console.log('[RiskJob] Starting daily risk calculation...');
    
    try {
      // Calculate risk for all portfolios
      const result = await riskScoringService.calculateAllPortfolioRisks();
      
      console.log(`[RiskJob] ✓ Complete. Success: ${result.successful}, Failed: ${result.failed}`);
      
      // Log errors (limit to first 5 to avoid log spam)
      if (result.errors.length > 0) {
        console.error('[RiskJob] Errors:', result.errors.slice(0, 5));
      }

    } catch (error) {
      console.error('[RiskJob] Critical error during risk calculation:', error);
      // TODO: Send alert notification for critical failures
    }
  });
  
  console.log(`✓ Risk calculation job scheduled (${cronSchedule} UTC = 6:00 PM ET daily)`);
}
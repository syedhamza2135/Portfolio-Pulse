import cron from 'node-cron';
import riskScoringService from '../services/riskScoringService.js';

/**
 * Starts the daily risk calculation job
 * Runs at 6:00 PM ET (23:00 UTC) after market close per PRD
 */
export function startRiskCalculationJob() {
  // Run daily at 23:00 UTC (6:00 PM ET)
  // Adjust based on your server's timezone
  const cronSchedule = process.env.RISK_CALC_CRON || '0 23 * * *';
  
  cron.schedule(cronSchedule, async () => {
    console.log('[RiskJob] Starting daily risk calculation...');
    
    try {
      const result = await riskScoringService.calculateAllPortfolioRisks();
      
      console.log(`[RiskJob] ✓ Complete. Success: ${result.successful}, Failed: ${result.failed}`);
      
      if (result.errors.length > 0) {
        console.error('[RiskJob] Errors:', result.errors.slice(0, 5)); // Log first 5 errors
      }

    } catch (error) {
      console.error('[RiskJob] Critical error during risk calculation:', error);
    }
  });
  
  console.log(`✓ Risk calculation job scheduled (${cronSchedule} UTC = 6:00 PM ET daily)`);
}
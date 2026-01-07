import cron from 'node-cron';
import priceUpdateService from '../services/priceUpdateService.js';

export function startPriceUpdateJob() {
  let consecutiveFailures = 0;
  const MAX_FAILURES = 3;
  
  const cronSchedule = process.env.PRICE_UPDATE_CRON || '*/15 14-20 * * 1-5';
  
  cron.schedule(cronSchedule, async () => {
    console.log('[Cron] Starting scheduled price update...');
    
    try {
      const result = await priceUpdateService.updateAllPrices();
      console.log(`[Cron] ✓ Updated ${result.tickersUpdated} tickers, ${result.portfoliosUpdated} portfolios`);
      consecutiveFailures = 0;
    } catch (err) {
      console.error('[Cron] Price update failed:', err);
      consecutiveFailures++;
      
      if (consecutiveFailures >= MAX_FAILURES) {
        console.error(`[Cron] ⚠️ ${MAX_FAILURES} consecutive failures - manual intervention needed`);
      }
    }
  });
  
  console.log(`✓ Price update cron job started (schedule: ${cronSchedule} UTC)`);
  console.log('  Note: Runs every 15 min during 14:00-20:00 UTC (approx 9am-4pm ET)');
}
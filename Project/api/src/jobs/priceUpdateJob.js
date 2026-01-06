import cron from 'node-cron';
import priceUpdateService from '../services/priceUpdateService.js';

export function startPriceUpdateJob() {
  let consecutiveFailures = 0;
  const MAX_FAILURES = 3;
  
  cron.schedule('*/5 9-16 * * 1-5', async () => {
    console.log('[Cron] Starting scheduled price update...');
    
    try {
      const result = await priceUpdateService.updateAllPrices();
      console.log(`[Cron] ✓ Updated ${result.updated}/${result.total} tickers`);
      consecutiveFailures = 0;
    } catch (err) {
      console.error('[Cron] Price update failed:', err);
      consecutiveFailures++;
      
      if (consecutiveFailures >= MAX_FAILURES) {
        console.error(`[Cron] ⚠️ ${MAX_FAILURES} consecutive failures - manual intervention needed`);
      }
    }
  }, {
    timezone: 'America/New_York'
  });
  
  console.log('✓ Price update cron job started (every 5 min during market hours)');
}
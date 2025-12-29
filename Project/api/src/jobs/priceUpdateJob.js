import cron from 'node-cron';
import priceUpdateService from '../services/priceUpdateService.js';

export function startPriceUpdateJob() {
  cron.schedule('*/15 9-16 * * 1-5', async () => {
    console.log('[Cron] Starting scheduled price update...');
    
    try {
      const result = await priceUpdateService.updateAllPrices();
      console.log(`[Cron] ✓ Updated ${result.updated}/${result.total} tickers`);
    } catch (err) {
      console.error('[Cron] Price update failed:', err);
    }
  }, {
    timezone: "America/New_York"
  });
  
  console.log('✓ Price update cron job started (every 15 min during market hours)');
}
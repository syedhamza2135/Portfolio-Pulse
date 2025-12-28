import cron from 'node-cron';
import priceUpdateService from '../services/priceUpdateService.js';

// Run every 15 minutes during market hours
// 9:30 AM - 4:00 PM EST, Mon-Fri
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
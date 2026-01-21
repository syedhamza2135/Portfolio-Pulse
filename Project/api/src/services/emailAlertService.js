/**
 * Email Alert Service
 * 
 * Handles sending email notifications for portfolio alerts.
 * 
 * Features:
 * - Portfolio threshold alerts (value change exceeds threshold)
 * - Holding-specific alerts (individual holding price changes)
 * - Sentiment alerts (high-impact news sentiment)
 * - Daily email limit enforcement (3 emails per user per day)
 * - HTML and plain text email templates
 * - User preference checking (respects emailEnabled setting)
 * 
 * Email Provider: SendGrid
 * 
 * @module services/emailAlertService
 * @requires @sendgrid/mail
 * @requires models/user
 */

import sgMail from '@sendgrid/mail';
import User from '../models/user.js';

/**
 * Email Alert Service Class
 * 
 * Manages email sending with rate limiting and user preferences.
 */
class EmailAlertService {
  /**
   * Initializes the email alert service
   * 
   * Sets up daily email tracking and rate limiting.
   */
  constructor() {
    this.initialized = false;
    
    // Daily email limit tracking per user
    this.dailyEmailCount = new Map();
    
    // Maximum emails per user per day (PRD requirement)
    this.maxEmailsPerDay = 3;
    
    // Time when daily counter resets
    this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    
    // Track cleanup interval to prevent memory leak
    this.cleanupInterval = null;
    
    // Start automatic cleanup
    this.startDailyReset();
  }

  /**
   * Starts automatic daily counter reset
   * Prevents memory leak by properly managing the interval
   */
  startDailyReset() {
    // Clear existing interval if any
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Check every hour if reset is needed
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      if (now >= this.resetTime) {
        this.dailyEmailCount.clear();
        this.resetTime = now + 24 * 60 * 60 * 1000;
        console.log('[EmailAlert] Daily email counter reset');
      }
    }, 60 * 60 * 1000); // Check every hour

    // Allow process to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Graceful cleanup - clears intervals
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.dailyEmailCount.clear();
    console.log('✓ EmailAlertService destroyed');
  }

  /**
   * Initializes SendGrid email service
   * 
   * Configures SendGrid with API key from environment variables.
   * Service is disabled if API key is not configured.
   * 
   * @function initialize
   * 
   * @returns {boolean} True if initialization successful, false otherwise
   */
  initialize() {
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠ SENDGRID_API_KEY not configured. Email alerts disabled.');
      return false;
    }

    try {
      sgMail.setApiKey(apiKey);
      this.initialized = true;
      console.log('✓ SendGrid email service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize SendGrid:', error.message);
      return false;
    }
  }

  /**
   * Checks if user has exceeded daily email limit
   * 
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user can receive more emails today
   */
  canSendEmail(userId) {
    // Auto-reset counter if 24 hours have passed
    if (Date.now() > this.resetTime) {
      this.dailyEmailCount.clear();
      this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    const count = this.dailyEmailCount.get(userId.toString()) || 0;
    return count < this.maxEmailsPerDay;
  }

  /**
   * Increments email count for user
   * 
   * @param {string} userId - User ID to increment count for
   */
  incrementEmailCount(userId) {
    const userIdStr = userId.toString();
    const current = this.dailyEmailCount.get(userIdStr) || 0;
    this.dailyEmailCount.set(userIdStr, current + 1);
  }

  /**
   * FIX: Gets remaining email count for user
   * 
   * @param {string} userId - User ID to check
   * @returns {number} Number of emails remaining today
   */
  getRemainingEmails(userId) {
    const count = this.dailyEmailCount.get(userId.toString()) || 0;
    return Math.max(0, this.maxEmailsPerDay - count);
  }

  /**
   * Sends portfolio threshold alert email
   * 
   * Triggered when portfolio total value change exceeds user's alert threshold.
   * 
   * Process:
   * 1. Checks user preferences (emailEnabled)
   * 2. Checks daily email limit
   * 3. Sends HTML and plain text email
   * 4. Increments email count
   * 
   * @async
   * @function sendPortfolioThresholdAlert
   * @param {string} userId - User ID to send alert to
   * @param {Object} portfolioData - Portfolio data
   * @param {string} portfolioData.name - Portfolio name
   * @param {number} portfolioData.totalValue - Current portfolio value
   * @param {number} portfolioData.dailyChange - Dollar change
   * @param {string} [portfolioData.userId] - Optional user ID for email count display
   * @param {number} changePercent - Percentage change in portfolio value
   * 
   * @returns {Promise<boolean>} True if email sent successfully
   */
  async sendPortfolioThresholdAlert(userId, portfolioData, changePercent) {
    if (!this.initialized) {
      console.warn('[EmailAlert] SendGrid not initialized');
      return false;
    }

    try {
      // Input validation
      if (!userId || !portfolioData || typeof changePercent !== 'number') {
        console.error('[EmailAlert] Invalid parameters for portfolio alert');
        return false;
      }

      // Check user preferences
      const user = await User.findById(userId).select('email preferences').lean();
      
      if (!user) {
        console.error('[EmailAlert] User not found:', userId);
        return false;
      }

      if (!user.preferences?.emailEnabled) {
        console.log(`[EmailAlert] User ${user.email} has disabled email alerts`);
        return false;
      }

      // Check daily limit
      if (!this.canSendEmail(userId)) {
        const resetHours = Math.ceil((this.resetTime - Date.now()) / 3600000);
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email} (resets in ${resetHours}h)`);
        return false;
      }

      const direction = changePercent >= 0 ? 'increased' : 'decreased';
      const emoji = changePercent >= 0 ? '📈' : '📉';

      const msg = {
        to: user.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'alerts@portfoliopulse.app',
        subject: `${emoji} Your portfolio ${direction} by ${Math.abs(changePercent).toFixed(2)}%`,
        text: this.generatePortfolioAlertText(portfolioData, changePercent),
        html: this.generatePortfolioAlertHTML(portfolioData, changePercent)
      };

      // Timeout and Error handling
      await Promise.race([
        sgMail.send(msg),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email send timeout')), 10000)
        )
      ]);

      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent portfolio alert to ${user.email} (${this.getRemainingEmails(userId)} remaining today)`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Send error:', error.message);
      
      // Log SendGrid-specific errors
      if (error.response) {
        console.error('[EmailAlert] SendGrid response:', {
          statusCode: error.response.statusCode,
          body: error.response.body
        });
      }
      
      return false;
    }
  }

  /**
   * Sends holding-specific alert email
   * 
   * Triggered when individual holding price change exceeds threshold.
   * 
   * @async
   * @function sendHoldingAlert
   * @param {string} userId - User ID to send alert to
   * @param {Object} holdingData - Holding data
   * @param {string} holdingData.ticker - Ticker symbol
   * @param {number} holdingData.currentPrice - Current price
   * @param {number} holdingData.quantity - Number of shares
   * @param {string} holdingData._id - Holding ID
   * @param {number} changePercent - Percentage change in holding price
   * 
   * @returns {Promise<boolean>} True if email sent successfully
   */
  async sendHoldingAlert(userId, holdingData, changePercent) {
    if (!this.initialized) return false;

    try {
      // Input validation
      if (!userId || !holdingData || typeof changePercent !== 'number') {
        console.error('[EmailAlert] Invalid parameters for holding alert');
        return false;
      }

      const user = await User.findById(userId).select('email preferences').lean();
      
      if (!user?.preferences?.emailEnabled) return false;
      
      if (!this.canSendEmail(userId)) {
        const resetHours = Math.ceil((this.resetTime - Date.now()) / 3600000);
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email} (resets in ${resetHours}h)`);
        return false;
      }

      const direction = changePercent >= 0 ? 'up' : 'down';
      const emoji = changePercent >= 0 ? '🚀' : '⚠️';

      const msg = {
        to: user.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'alerts@portfoliopulse.app',
        subject: `${emoji} ${holdingData.ticker} is ${direction} ${Math.abs(changePercent).toFixed(2)}%`,
        text: this.generateHoldingAlertText(holdingData, changePercent),
        html: this.generateHoldingAlertHTML(holdingData, changePercent)
      };

      // Timeout
      await Promise.race([
        sgMail.send(msg),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email send timeout')), 10000)
        )
      ]);

      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent holding alert (${holdingData.ticker}) to ${user.email}`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Holding alert error:', error.message);
      return false;
    }
  }

  /**
   * Sends sentiment alert email
   * 
   * Triggered when sentiment score indicates high-impact news:
   * - Positive: sentimentScore > +0.7
   * - Negative: sentimentScore < -0.7
   * 
   * @async
   * @function sendSentimentAlert
   * @param {string} userId - User ID to send alert to
   * @param {string} ticker - Ticker symbol with high-impact sentiment
   * @param {number} sentimentScore - Sentiment score (-1 to +1)
   * @param {Array<Object>} articles - Articles that triggered the alert
   * 
   * @returns {Promise<boolean>} True if email sent successfully
   */
  async sendSentimentAlert(userId, ticker, sentimentScore, articles) {
    if (!this.initialized) return false;

    try {
      // Input validation
      if (!userId || !ticker || typeof sentimentScore !== 'number' || !Array.isArray(articles)) {
        console.error('[EmailAlert] Invalid parameters for sentiment alert');
        return false;
      }

      const user = await User.findById(userId).select('email preferences').lean();
      
      if (!user?.preferences?.emailEnabled) return false;
      
      if (!this.canSendEmail(userId)) {
        const resetHours = Math.ceil((this.resetTime - Date.now()) / 3600000);
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email} (resets in ${resetHours}h)`);
        return false;
      }

      const sentiment = sentimentScore > 0 ? 'Positive' : 'Negative';
      const emoji = sentimentScore > 0 ? '✨' : '🔴';

      const msg = {
        to: user.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'alerts@portfoliopulse.app',
        subject: `${emoji} ${sentiment} news detected for ${ticker}`,
        text: this.generateSentimentAlertText(ticker, sentimentScore, articles),
        html: this.generateSentimentAlertHTML(ticker, sentimentScore, articles)
      };

      // Timeout
      await Promise.race([
        sgMail.send(msg),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Email send timeout')), 10000)
        )
      ]);

      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent sentiment alert (${ticker}) to ${user.email}`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Sentiment alert error:', error.message);
      return false;
    }
  }

  /**
   * Generates HTML email template for portfolio alerts
   * 
   * Creates a responsive HTML email with portfolio value and change information.
   * Includes styling and call-to-action button.
   * 
   * @function generatePortfolioAlertHTML
   * @param {Object} portfolioData - Portfolio data
   * @param {number} changePercent - Percentage change in portfolio value
   * 
   * @returns {string} HTML email content
   */
  generatePortfolioAlertHTML(portfolioData, changePercent) {
    const changeColor = changePercent >= 0 ? '#10b981' : '#ef4444';
    const direction = changePercent >= 0 ? '▲' : '▼';
    
    // FIX: Safe fallback for missing values
    const portfolioName = portfolioData?.name || 'Your Portfolio';
    const totalValue = portfolioData?.totalValue || 0;
    const dailyChange = portfolioData?.dailyChange || 0;
    const currentCount = this.dailyEmailCount.get(portfolioData.userId?.toString()) || 1;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid ${changeColor}; }
          .change { font-size: 24px; font-weight: bold; color: ${changeColor}; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          a { color: #3b82f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Portfolio Alert</h1>
          </div>
          <div class="content">
            <h2>${portfolioName}</h2>
            <div class="metric">
              <p style="margin: 0; color: #6b7280;">Current Value</p>
              <p style="margin: 5px 0; font-size: 28px; font-weight: bold;">$${totalValue.toFixed(2)}</p>
            </div>
            <div class="metric">
              <p style="margin: 0; color: #6b7280;">Change</p>
              <p class="change">${direction} ${Math.abs(changePercent).toFixed(2)}%</p>
              <p style="margin: 5px 0; color: ${changeColor};">$${Math.abs(dailyChange).toFixed(2)}</p>
            </div>
            <p>Your portfolio value has changed significantly. Click below to view details.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">View Dashboard</a>
            <div class="footer">
              <p>PortfolioPulse | <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings">Manage Alerts</a></p>
              <p>This is alert ${currentCount} of ${this.maxEmailsPerDay} today</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates plain text email template for portfolio alerts
   * 
   * Plain text fallback for email clients that don't support HTML.
   * 
   * @function generatePortfolioAlertText
   * @param {Object} portfolioData - Portfolio data
   * @param {number} changePercent - Percentage change in portfolio value
   * 
   * @returns {string} Plain text email content
   */
  generatePortfolioAlertText(portfolioData, changePercent) {
    const direction = changePercent >= 0 ? 'increased' : 'decreased';
    const portfolioName = portfolioData?.name || 'Your Portfolio';
    const totalValue = portfolioData?.totalValue || 0;
    const dailyChange = portfolioData?.dailyChange || 0;
    
    return `
Portfolio Alert: ${portfolioName}

Your portfolio has ${direction} by ${Math.abs(changePercent).toFixed(2)}%

Current Value: $${totalValue.toFixed(2)}
Change: $${Math.abs(dailyChange).toFixed(2)}

View your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard

---
PortfolioPulse
Manage your alert preferences: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings
    `.trim();
  }

  /**
   * Generates HTML email template for holding alerts
   * 
   * Creates a responsive HTML email with holding price change information.
   * 
   * @function generateHoldingAlertHTML
   * @param {Object} holdingData - Holding data
   * @param {number} changePercent - Percentage change in holding price
   * 
   * @returns {string} HTML email content
   */
  generateHoldingAlertHTML(holdingData, changePercent) {
    const changeColor = changePercent >= 0 ? '#10b981' : '#ef4444';
    const direction = changePercent >= 0 ? '▲' : '▼';
    
    // Safe fallback for missing values
    const ticker = holdingData?.ticker || 'N/A';
    const currentPrice = holdingData?.currentPrice || 0;
    const quantity = holdingData?.quantity || 0;
    const holdingId = holdingData?._id || '';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .ticker { font-size: 32px; font-weight: bold; color: #1f2937; margin: 10px 0; }
          .change { font-size: 24px; font-weight: bold; color: ${changeColor}; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📈 Holding Alert</h1>
          </div>
          <div class="content">
            <div class="ticker">${ticker}</div>
            <p class="change">${direction} ${Math.abs(changePercent).toFixed(2)}%</p>
            <p>Current Price: $${currentPrice.toFixed(2)}</p>
            <p>Your Position: ${quantity} shares</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/holdings/${holdingId}" class="button">View Details</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates plain text email template for holding alerts
   * 
   * Plain text fallback for email clients that don't support HTML.
   * 
   * @function generateHoldingAlertText
   * @param {Object} holdingData - Holding data
   * @param {number} changePercent - Percentage change in holding price
   * 
   * @returns {string} Plain text email content
   */
  generateHoldingAlertText(holdingData, changePercent) {
    const direction = changePercent >= 0 ? 'up' : 'down';
    const ticker = holdingData?.ticker || 'N/A';
    const currentPrice = holdingData?.currentPrice || 0;
    const quantity = holdingData?.quantity || 0;
    const holdingId = holdingData?._id || '';
    
    return `
Holding Alert: ${ticker}

Price is ${direction} ${Math.abs(changePercent).toFixed(2)}%

Current Price: $${currentPrice.toFixed(2)}
Your Position: ${quantity} shares

View details: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/holdings/${holdingId}

---
PortfolioPulse
    `.trim();
  }

  /**
   * Generates HTML email template for sentiment alerts
   * 
   * Creates a responsive HTML email with sentiment analysis and top articles.
   * 
   * @function generateSentimentAlertHTML
   * @param {string} ticker - Ticker symbol
   * @param {number} sentimentScore - Sentiment score (-1 to +1)
   * @param {Array<Object>} articles - Top articles (up to 3 displayed)
   * 
   * @returns {string} HTML email content
   */
  generateSentimentAlertHTML(ticker, sentimentScore, articles) {
    const sentiment = sentimentScore > 0 ? 'Positive' : 'Negative';
    const color = sentimentScore > 0 ? '#10b981' : '#ef4444';
    
    // Safe fallback for empty articles
    const topArticles = (articles || []).slice(0, 3);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .article { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 3px solid ${color}; }
          .score { font-size: 48px; font-weight: bold; color: ${color}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${sentiment} News: ${ticker}</h1>
          </div>
          <div class="content">
            <p class="score">${sentimentScore > 0 ? '+' : ''}${sentimentScore.toFixed(2)}</p>
            <p>High-impact ${sentiment.toLowerCase()} sentiment detected</p>
            ${topArticles.length > 0 ? `
              <h3>Recent Articles:</h3>
              ${topArticles.map(a => `
                <div class="article">
                  <strong>${a?.title || 'Untitled Article'}</strong><br>
                  <small>${a?.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : 'Date unknown'}</small>
                </div>
              `).join('')}
            ` : '<p>No recent articles available.</p>'}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates plain text email template for sentiment alerts
   * 
   * Plain text fallback for email clients that don't support HTML.
   * 
   * @function generateSentimentAlertText
   * @param {string} ticker - Ticker symbol
   * @param {number} sentimentScore - Sentiment score (-1 to +1)
   * @param {Array<Object>} articles - Top articles (up to 3 displayed)
   * 
   * @returns {string} Plain text email content
   */
  generateSentimentAlertText(ticker, sentimentScore, articles) {
    const sentiment = sentimentScore > 0 ? 'Positive' : 'Negative';
    const topArticles = (articles || []).slice(0, 3);
    
    const articleText = topArticles.length > 0
      ? topArticles.map(a => `- ${a?.title || 'Untitled'} (${a?.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : 'Date unknown'})`).join('\n')
      : '- No recent articles available';
    
    return `
Sentiment Alert: ${ticker}

${sentiment} sentiment detected: ${sentimentScore > 0 ? '+' : ''}${sentimentScore.toFixed(2)}

Recent Articles:
${articleText}

View full analysis: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/holdings

---
PortfolioPulse
    `.trim();
  }

  /**
   * Get service status for monitoring
   * 
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      maxEmailsPerDay: this.maxEmailsPerDay,
      activeUsers: this.dailyEmailCount.size,
      resetTime: new Date(this.resetTime).toISOString(),
      resetInHours: Math.ceil((this.resetTime - Date.now()) / 3600000)
    };
  }
}

export default new EmailAlertService();
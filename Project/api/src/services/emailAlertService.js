import sgMail from '@sendgrid/mail';
import User from '../models/user.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';

class EmailAlertService {
  constructor() {
    this.initialized = false;
    this.dailyEmailCount = new Map(); // Track emails per user
    this.maxEmailsPerDay = 3; // Per PRD requirement
    this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
  }

  /**
   * Initializes SendGrid with API key
   */
  initialize() {
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠ SENDGRID_API_KEY not configured. Email alerts disabled.');
      return false;
    }

    sgMail.setApiKey(apiKey);
    this.initialized = true;
    console.log('✓ SendGrid email service initialized');
    return true;
  }

  /**
   * Checks if user has exceeded daily email limit
   */
  canSendEmail(userId) {
    // Reset counter if 24 hours have passed
    if (Date.now() > this.resetTime) {
      this.dailyEmailCount.clear();
      this.resetTime = Date.now() + 24 * 60 * 60 * 1000;
    }

    const count = this.dailyEmailCount.get(userId.toString()) || 0;
    return count < this.maxEmailsPerDay;
  }

  /**
   * Increments email count for user
   */
  incrementEmailCount(userId) {
    const userIdStr = userId.toString();
    const current = this.dailyEmailCount.get(userIdStr) || 0;
    this.dailyEmailCount.set(userIdStr, current + 1);
  }

  /**
   * Sends portfolio threshold alert
   * Triggered when portfolio value changes exceed user's threshold
   */
  async sendPortfolioThresholdAlert(userId, portfolioData, changePercent) {
    if (!this.initialized) {
      console.warn('[EmailAlert] SendGrid not initialized');
      return false;
    }

    try {
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
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email}`);
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

      await sgMail.send(msg);
      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent portfolio alert to ${user.email}`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Send error:', error.message);
      return false;
    }
  }

  /**
   * Sends holding-specific alert
   * Triggered when individual holding changes exceed threshold
   */
  async sendHoldingAlert(userId, holdingData, changePercent) {
    if (!this.initialized) return false;

    try {
      const user = await User.findById(userId).select('email preferences').lean();
      
      if (!user?.preferences?.emailEnabled) return false;
      if (!this.canSendEmail(userId)) {
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email}`);
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

      await sgMail.send(msg);
      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent holding alert (${holdingData.ticker}) to ${user.email}`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Holding alert error:', error.message);
      return false;
    }
  }

  /**
   * Sends sentiment alert for high-impact news
   * Triggered when sentiment score < -0.7 or > +0.7
   */
  async sendSentimentAlert(userId, ticker, sentimentScore, articles) {
    if (!this.initialized) return false;

    try {
      const user = await User.findById(userId).select('email preferences').lean();
      
      if (!user?.preferences?.emailEnabled) return false;
      if (!this.canSendEmail(userId)) {
        console.warn(`[EmailAlert] Daily limit reached for user ${user.email}`);
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

      await sgMail.send(msg);
      this.incrementEmailCount(userId);
      
      console.log(`[EmailAlert] ✓ Sent sentiment alert (${ticker}) to ${user.email}`);
      return true;

    } catch (error) {
      console.error('[EmailAlert] Sentiment alert error:', error.message);
      return false;
    }
  }

  /**
   * HTML template for portfolio alerts
   */
  generatePortfolioAlertHTML(portfolioData, changePercent) {
    const changeColor = changePercent >= 0 ? '#10b981' : '#ef4444';
    const direction = changePercent >= 0 ? '▲' : '▼';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid ${changeColor}; }
          .change { font-size: 24px; font-weight: bold; color: ${changeColor}; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Portfolio Alert</h1>
          </div>
          <div class="content">
            <h2>${portfolioData.name}</h2>
            <div class="metric">
              <p style="margin: 0; color: #6b7280;">Current Value</p>
              <p style="margin: 5px 0; font-size: 28px; font-weight: bold;">$${portfolioData.totalValue.toFixed(2)}</p>
            </div>
            <div class="metric">
              <p style="margin: 0; color: #6b7280;">Change</p>
              <p class="change">${direction} ${Math.abs(changePercent).toFixed(2)}%</p>
              <p style="margin: 5px 0; color: ${changeColor};">$${Math.abs(portfolioData.dailyChange).toFixed(2)}</p>
            </div>
            <p>Your portfolio value has changed significantly. Click below to view details.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">View Dashboard</a>
            <div class="footer">
              <p>PortfolioPulse | <a href="${process.env.FRONTEND_URL}/settings">Manage Alerts</a></p>
              <p>This is alert ${this.dailyEmailCount.get(portfolioData.userId?.toString()) || 1} of ${this.maxEmailsPerDay} today</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Plain text version for portfolio alerts
   */
  generatePortfolioAlertText(portfolioData, changePercent) {
    const direction = changePercent >= 0 ? 'increased' : 'decreased';
    return `
Portfolio Alert: ${portfolioData.name}

Your portfolio has ${direction} by ${Math.abs(changePercent).toFixed(2)}%

Current Value: $${portfolioData.totalValue.toFixed(2)}
Change: $${Math.abs(portfolioData.dailyChange).toFixed(2)}

View your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard

---
PortfolioPulse
Manage your alert preferences: ${process.env.FRONTEND_URL}/settings
    `.trim();
  }

  /**
   * HTML template for holding alerts
   */
  generateHoldingAlertHTML(holdingData, changePercent) {
    const changeColor = changePercent >= 0 ? '#10b981' : '#ef4444';
    const direction = changePercent >= 0 ? '▲' : '▼';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
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
            <div class="ticker">${holdingData.ticker}</div>
            <p class="change">${direction} ${Math.abs(changePercent).toFixed(2)}%</p>
            <p>Current Price: $${holdingData.currentPrice.toFixed(2)}</p>
            <p>Your Position: ${holdingData.quantity} shares</p>
            <a href="${process.env.FRONTEND_URL}/holdings/${holdingData._id}" class="button">View Details</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Plain text version for holding alerts
   */
  generateHoldingAlertText(holdingData, changePercent) {
    const direction = changePercent >= 0 ? 'up' : 'down';
    return `
Holding Alert: ${holdingData.ticker}

Price is ${direction} ${Math.abs(changePercent).toFixed(2)}%

Current Price: $${holdingData.currentPrice.toFixed(2)}
Your Position: ${holdingData.quantity} shares

View details: ${process.env.FRONTEND_URL}/holdings/${holdingData._id}

---
PortfolioPulse
    `.trim();
  }

  /**
   * HTML template for sentiment alerts
   */
  generateSentimentAlertHTML(ticker, sentimentScore, articles) {
    const sentiment = sentimentScore > 0 ? 'Positive' : 'Negative';
    const color = sentimentScore > 0 ? '#10b981' : '#ef4444';
    const topArticles = articles.slice(0, 3);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
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
            <h3>Recent Articles:</h3>
            ${topArticles.map(a => `
              <div class="article">
                <strong>${a.title}</strong><br>
                <small>${new Date(a.publishedAt).toLocaleDateString()}</small>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Plain text version for sentiment alerts
   */
  generateSentimentAlertText(ticker, sentimentScore, articles) {
    const sentiment = sentimentScore > 0 ? 'Positive' : 'Negative';
    const topArticles = articles.slice(0, 3);
    
    return `
Sentiment Alert: ${ticker}

${sentiment} sentiment detected: ${sentimentScore > 0 ? '+' : ''}${sentimentScore.toFixed(2)}

Recent Articles:
${topArticles.map(a => `- ${a.title} (${new Date(a.publishedAt).toLocaleDateString()})`).join('\n')}

View full analysis: ${process.env.FRONTEND_URL}/holdings

---
PortfolioPulse
    `.trim();
  }
}

export default new EmailAlertService();
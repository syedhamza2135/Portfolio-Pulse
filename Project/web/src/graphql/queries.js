import { gql } from '@apollo/client';

/**
 * Optimized Dashboard query
 * - Fetches only portfolio metadata (no holdings)
 * - Fetches top gainers/losers (limited)
 * - Fetches overall stats
 */
export const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($portfolioLimit: Int = 5, $topHoldingsLimit: Int = 5) {
    dashboardData(portfolioLimit: $portfolioLimit, topHoldingsLimit: $topHoldingsLimit) {
      user {
        id
        email
        createdAt
        preferences {
          alertThreshold
          emailEnabled
        }
      }
      portfolios {
        id
        name
        description
        totalValue
        dailyChange
        lastUpdated
      }
      overallStats {
        totalPortfolios
        totalHoldings
        totalInvestment
        currentValue
        totalProfitLoss
        totalProfitLossPercent
        lastUpdated
      }
      topGainers {
        id
        ticker
        quantity
        currentPrice
        profitLoss
        profitLossPercent
      }
      topLosers {
        id
        ticker
        quantity
        currentPrice
        profitLoss
        profitLossPercent
      }
    }
  }
`;

/**
 * Fetch detailed portfolio with all holdings and sentiment
 * - Use only when user opens a portfolio detail page
 */
export const GET_PORTFOLIO_DETAILS = gql`
  query GetPortfolioDetails($id: ID!, $holdingsLimit: Int = 50) {
    portfolio(id: $id) {
      id
      name
      description
      totalValue
      dailyChange
      lastUpdated
      holdings(limit: $holdingsLimit) {
        id
        ticker
        assetType
        quantity
        averageCost
        currentPrice
        lastPriceUpdate
        currentValue
        totalCost
        profitLoss
        profitLossPercent
        sentiment {
          sentimentScore
          articles {
            title
            url
            sentiment
            publishedAt
          }
          calculatedAt
        }
      }
      riskMetrics {
        overallScore
        components {
          volatility
          concentration
          sectorExposure
        }
        calculatedAt
      }
      stats {
        totalHoldings
        totalInvestment
        currentValue
        totalProfitLoss
        totalProfitLossPercent
      }
    }
  }
`;

/**
 * List of portfolios
 */
export const GET_PORTFOLIOS = gql`
  query GetPortfolios {
    portfolios {
      id
      name
      description
      totalValue
      dailyChange
      lastUpdated
      createdAt
    }
  }
`;

/**
 * Fetch holdings for a specific portfolio
 * - Lazy-load on portfolio detail page
 */
export const GET_HOLDINGS = gql`
  query GetHoldings($portfolioId: ID!, $limit: Int = 50) {
    holdings(filter: { portfolioId: $portfolioId }, limit: $limit) {
      id
      ticker
      assetType
      quantity
      averageCost
      currentPrice
      lastPriceUpdate
      currentValue
      totalCost
      profitLoss
      profitLossPercent
    }
  }
`;

/**
 * Portfolio stats
 */
export const GET_PORTFOLIO_STATS = gql`
  query GetPortfolioStats($portfolioId: ID) {
    portfolioStats(portfolioId: $portfolioId) {
      totalPortfolios
      totalHoldings
      totalInvestment
      currentValue
      totalProfitLoss
      totalProfitLossPercent
      portfoliosWithHoldings
      lastUpdated
    }
  }
`;

/**
 * Current user
 */
export const GET_ME = gql`
  query GetMe {
    me {
      id
      email
      createdAt
      preferences {
        alertThreshold
        emailEnabled
      }
    }
  }
`;

/**
 * Update user preferences
 */
export const UPDATE_USER_PREFERENCES = gql`
  mutation UpdateUserPreferences($alertThreshold: Float, $emailEnabled: Boolean) {
    updateUserPreferences(alertThreshold: $alertThreshold, emailEnabled: $emailEnabled) {
      id
      preferences {
        alertThreshold
        emailEnabled
      }
    }
  }
`;

/**
 * Refresh holding price
 */
export const REFRESH_HOLDING_PRICE = gql`
  mutation RefreshHoldingPrice($id: ID!) {
    refreshHoldingPrice(id: $id) {
      id
      currentPrice
      lastPriceUpdate
      currentValue
      profitLoss
      profitLossPercent
    }
  }
`;

/**
 * Refresh portfolio prices
 * - Fetches portfolio and top holdings only
 */
export const REFRESH_PORTFOLIO_PRICES = gql`
  mutation RefreshPortfolioPrices($id: ID!, $holdingsLimit: Int = 20) {
    refreshPortfolioPrices(id: $id) {
      id
      totalValue
      dailyChange
      lastUpdated
      holdings(limit: $holdingsLimit) {
        id
        currentPrice
        currentValue
      }
    }
  }
`;
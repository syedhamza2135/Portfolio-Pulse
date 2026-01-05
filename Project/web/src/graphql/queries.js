import { gql } from '@apollo/client';

export const GET_DASHBOARD_DATA = gql`
  query GetDashboardData {
    dashboardData {
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
        holdings {
          id
          ticker
          quantity
          currentPrice
          averageCost
          currentValue
          totalCost
          profitLoss
          profitLossPercent
        }
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

// Portfolio with nested holdings and sentiment
export const GET_PORTFOLIO_DETAILS = gql`
  query GetPortfolioDetails($id: ID!) {
    portfolio(id: $id) {
      id
      name
      description
      totalValue
      dailyChange
      lastUpdated
      holdings {
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

// Simple portfolio list (for portfolios page)
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

// Holdings for a specific portfolio
export const GET_HOLDINGS = gql`
  query GetHoldings($portfolioId: ID!) {
    holdings(filter: { portfolioId: $portfolioId }) {
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

// Portfolio stats (can use REST or GraphQL)
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

// Get current user
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

// Mutations
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

export const REFRESH_PORTFOLIO_PRICES = gql`
  mutation RefreshPortfolioPrices($id: ID!) {
    refreshPortfolioPrices(id: $id) {
      id
      totalValue
      dailyChange
      lastUpdated
      holdings {
        id
        currentPrice
        currentValue
      }
    }
  }
`;
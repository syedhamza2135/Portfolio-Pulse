/**
 * GraphQL Schema Definition
 * 
 * Defines the complete GraphQL API schema including:
 * - Type definitions (User, Portfolio, Holding, etc.)
 * - Enums (AssetType, PriceSource)
 * - Input types (for mutations)
 * - Queries (read operations)
 * - Mutations (write operations)
 * 
 * This schema provides a flexible, type-safe API for frontend applications.
 * 
 * @module graphql/schema
 */

export default `#graphql
  # Core Types
  type User {
    id: ID!
    email: String!
    createdAt: String!
    preferences: UserPreferences
  }

  type UserPreferences {
    alertThreshold: Float
    emailEnabled: Boolean
  }

  type Portfolio {
    id: ID!
    userId: ID!
    name: String!
    description: String
    totalValue: Float!
    dailyChange: Float!
    lastUpdated: String!
    createdAt: String!
    holdings: [Holding!]!
    riskMetrics: RiskMetrics
    stats: PortfolioStats!
  }

  type Holding {
    id: ID!
    portfolioId: ID!
    ticker: String!
    assetType: AssetType!
    quantity: Float!
    averageCost: Float!
    currentPrice: Float
    lastPriceUpdate: String
    priceSource: PriceSource
    currentValue: Float!
    totalCost: Float!
    profitLoss: Float!
    profitLossPercent: Float!
    sentiment: SentimentData
    priceHistory: [PricePoint!]
  }

  type SentimentData {
    ticker: String!
    sentimentScore: Float!
    articles: [Article!]!
    calculatedAt: String!
  }

  type Article {
    title: String!
    url: String!
    sentiment: Float!
    publishedAt: String!
  }

  type RiskMetrics {
    portfolioId: ID!
    overallScore: Float!
    components: RiskComponents!
    calculatedAt: String!
  }

  type RiskComponents {
    volatility: Float!
    concentration: Float!
    sectorExposure: Float!
  }

  type PortfolioStats {
    totalPortfolios: Int!
    totalHoldings: Int!
    totalInvestment: Float!
    currentValue: Float!
    totalProfitLoss: Float!
    totalProfitLossPercent: Float!
    portfoliosWithHoldings: Int!
    lastUpdated: String!
  }

  type PricePoint {
    date: String!
    price: Float!
  }

  # Enums
  enum AssetType {
    stock
    crypto
    etf
  }

  enum PriceSource {
    manual
    api
    scheduled
  }

  # Input Types
  input PortfolioFilter {
    userId: ID
    name: String
  }

  input HoldingFilter {
    portfolioId: ID
    ticker: String
    assetType: AssetType
  }

  input DateRange {
    start: String!
    end: String!
  }

  # Queries
  type Query {
    me: User
    portfolio(id: ID!): Portfolio
    portfolios(filter: PortfolioFilter): [Portfolio!]!
    
    # Refactored dashboardData query with optional limits
    dashboardData(
      portfolioLimit: Int
      topHoldingsLimit: Int
    ): DashboardData!
    
    holding(id: ID!): Holding
    holdings(filter: HoldingFilter!): [Holding!]!
    portfolioStats(portfolioId: ID): PortfolioStats!
    tickerPrice(ticker: String!, assetType: AssetType!): TickerPrice
  }

  type DashboardData {
    user: User!
    portfolios: [Portfolio!]!
    overallStats: PortfolioStats!
    recentActivity: [ActivityItem!]!
    topGainers: [Holding!]!
    topLosers: [Holding!]!
  }

  type ActivityItem {
    id: ID!
    type: String!
    description: String!
    timestamp: String!
  }

  type TickerPrice {
    ticker: String!
    price: Float!
    change: Float!
    changePercent: Float!
    timestamp: String!
  }

  # Mutations
  type Mutation {
    updateUserPreferences(alertThreshold: Float, emailEnabled: Boolean): User
    refreshHoldingPrice(id: ID!): Holding
    refreshPortfolioPrices(id: ID!): Portfolio
  }
`;
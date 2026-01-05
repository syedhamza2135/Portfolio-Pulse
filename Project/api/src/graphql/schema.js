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
    
    # Nested data - this is where GraphQL shines
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
    
    # Calculated fields
    currentValue: Float!
    totalCost: Float!
    profitLoss: Float!
    profitLossPercent: Float!
    
    # Nested data
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
    # User queries
    me: User

    # Portfolio queries
    portfolio(id: ID!): Portfolio
    portfolios(filter: PortfolioFilter): [Portfolio!]!
    
    # This is the MAIN GraphQL use case - dashboard data in ONE query
    dashboardData: DashboardData!
    
    # Holdings queries
    holding(id: ID!): Holding
    holdings(filter: HoldingFilter!): [Holding!]!
    
    # Stats queries
    portfolioStats(portfolioId: ID): PortfolioStats!
    
    # Price queries
    tickerPrice(ticker: String!, assetType: AssetType!): TickerPrice
  }

  # The killer feature - get everything for dashboard in one request
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

  # Mutations (optional - can keep these in REST)
  type Mutation {
    # These could stay in REST, but included for completeness
    updateUserPreferences(alertThreshold: Float, emailEnabled: Boolean): User
    refreshHoldingPrice(id: ID!): Holding
    refreshPortfolioPrices(id: ID!): Portfolio
  }
`;
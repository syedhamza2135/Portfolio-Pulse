import { useQuery } from '@apollo/client/react';
import { Link } from "react-router-dom";
import { GET_DASHBOARD_DATA } from "../../graphql/queries";
import PortfolioCard from "../../components/portfolio/PortfolioCard";
import Button from "../../components/ui/Button";

const MAX_RECENT_PORTFOLIOS = 5;

export default function Dashboard() {
  const { loading, error, data, refetch } = useQuery(GET_DASHBOARD_DATA, {
    pollInterval: 30000, // Auto-refresh every 30 seconds
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div 
            className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"
            role="status"
            aria-label="Loading dashboard"
          />
          <p className="mt-4 text-gray-600 font-medium">Loading your portfolios...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="shrink-0">
              <svg 
                className="w-6 h-6 text-red-600" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-red-800 font-medium text-lg">Error loading dashboard</h3>
              <p className="text-red-600 text-sm mt-1">{error.message}</p>
              <div className="mt-4">
                <Button 
                  onClick={() => refetch()}
                  variant="secondary"
                  size="sm"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { user, portfolios, overallStats, topGainers, topLosers } = data.dashboardData;
  const displayName = user?.email?.split('@')[0] || "User";
  const recentPortfolios = portfolios.slice(0, MAX_RECENT_PORTFOLIOS);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome back, {displayName}!</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <SummaryCard
          label="Total Portfolios"
          value={overallStats.totalPortfolios}
          icon={<PortfolioIcon />}
          iconBgColor="bg-blue-100"
          iconColor="text-blue-600"
        />
        <SummaryCard
          label="Total Holdings"
          value={overallStats.totalHoldings}
          icon={<HoldingsIcon />}
          iconBgColor="bg-green-100"
          iconColor="text-green-600"
        />
        <SummaryCard
          label="Total Value"
          value={`$${overallStats.currentValue.toLocaleString()}`}
          icon={<ValueIcon />}
          iconBgColor="bg-purple-100"
          iconColor="text-purple-600"
          subtitle={
            <span className={`text-sm ${
              overallStats.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {overallStats.totalProfitLoss >= 0 ? '+' : ''}
              ${Math.abs(overallStats.totalProfitLoss).toLocaleString()} 
              ({overallStats.totalProfitLossPercent.toFixed(2)}%)
            </span>
          }
        />
      </div>

      {/* Top Gainers/Losers */}
      {(topGainers.length > 0 || topLosers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {topGainers.length > 0 && (
            <TopHoldingsCard title="Top Gainers" holdings={topGainers} positive />
          )}
          {topLosers.length > 0 && (
            <TopHoldingsCard title="Top Losers" holdings={topLosers} positive={false} />
          )}
        </div>
      )}

      {/* Recent Portfolios */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900">Recent Portfolios</h2>
          {portfolios.length > MAX_RECENT_PORTFOLIOS && (
            <Link to="/portfolios">
              <Button variant="secondary" size="sm">
                View All ({portfolios.length})
              </Button>
            </Link>
          )}
        </div>

        {recentPortfolios.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentPortfolios.map((portfolio) => (
              <PortfolioCard 
                key={portfolio.id} 
                portfolio={{ ...portfolio, holdings: [] }} // no holdings on dashboard
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Quick Actions */}
      {portfolios.length > 0 && (
        <div className="mt-8 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Link to="/portfolios/create">
              <Button size="sm">
                <span className="flex items-center gap-2">
                  <PlusIcon /> New Portfolio
                </span>
              </Button>
            </Link>
            <Link to="/portfolios">
              <Button variant="secondary" size="sm">Manage All Portfolios</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <span className="flex items-center gap-2"><RefreshIcon /> Refresh Data</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------- Helper Components ---------------------- */

function TopHoldingsCard({ title, holdings, positive = true }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {positive ? <UpIcon /> : <DownIcon />}
        {title}
      </h3>
      <div className="space-y-3">
        {holdings.slice(0, 3).map(holding => (
          <div key={holding.id} className="flex justify-between items-center">
            <span className="font-semibold text-gray-900">{holding.ticker}</span>
            <span className={`${positive ? 'text-green-600' : 'text-red-600'} font-semibold`}>
              {positive ? '+' : ''}${Math.abs(holding.profitLoss).toFixed(2)} 
              <span className="text-sm ml-1">({holding.profitLossPercent.toFixed(2)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, iconBgColor, iconColor, subtitle }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <div className="mt-1">{subtitle}</div>}
        </div>
        <div className={`w-12 h-12 ${iconBgColor} rounded-lg flex items-center justify-center`}>
          <div className={iconColor}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <EmptyIcon />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No portfolios yet</h3>
        <p className="text-gray-600 mb-6">
          Get started by creating your first portfolio to track your investments.
        </p>
        <Link to="/portfolios/create">
          <Button className="w-full">Create Your First Portfolio</Button>
        </Link>
      </div>
    </div>
  );
}

/* ---------------------- Icons ---------------------- */
function PortfolioIcon() { /* ...same as before... */ }
function HoldingsIcon() { /* ...same as before... */ }
function ValueIcon() { /* ...same as before... */ }

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function UpIcon() {
  return (
    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  );
}
function EmptyIcon() { /* ...same as before... */ }

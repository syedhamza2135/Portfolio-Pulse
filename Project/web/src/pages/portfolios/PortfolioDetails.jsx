import { Link, useParams, useLocation } from "react-router-dom";
import useAutoRefresh from '../../hooks/useAutoRefresh.js';
import HoldingRow from "../../components/portfolio/HoldingRow.jsx";
import Button from "../../components/ui/Button.jsx";

export default function PortfolioDetails() {
  const { id } = useParams();
  const location = useLocation();
  const successMessage = location.state?.message;

  const { data: portfolio, loading, error, refetch } = useAutoRefresh(id, 30000);

  // Loading state
  if (loading) return <LoadingState message="Loading portfolio..." />;

  // Error state
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  // Portfolio not found
  if (!portfolio) return <NotFoundState />;

  // Calculate portfolio totals
  const totalInvestment = portfolio.holdings?.reduce((sum, h) => sum + (h.quantity * h.averageCost), 0) || 0;
  const currentValue = portfolio.holdings?.reduce((sum, h) => sum + (h.currentPrice ? h.quantity * h.currentPrice : h.quantity * h.averageCost), 0) || 0;
  const totalPL = portfolio.holdings?.reduce((sum, h) => {
    const cost = h.quantity * h.averageCost;
    const value = h.currentPrice ? h.quantity * h.currentPrice : cost;
    return sum + (value - cost);
  }, 0) || 0;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {successMessage && <SuccessMessage message={successMessage} />}

      <PortfolioHeader portfolio={portfolio} portfolioId={id} />

      {portfolio.holdings?.length > 0 
        ? (
          <>
            <HoldingsTable holdings={portfolio.holdings} portfolioId={id} />
            <PortfolioStats totalInvestment={totalInvestment} currentValue={currentValue} totalPL={totalPL} portfolio={portfolio} />
          </>
        ) 
        : <EmptyPortfolio portfolioId={id} />
      }
    </div>
  );
}

// ----------------- Subcomponents -----------------

function LoadingState({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <p className="text-red-800 font-medium">Error loading portfolio</p>
        <p className="text-red-600 text-sm mt-1">{message}</p>
      </div>
      <Button onClick={onRetry}>Try Again</Button>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="p-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <p className="text-yellow-800">Portfolio not found</p>
      </div>
      <Link to="/portfolios">
        <Button variant="secondary">Back to Portfolios</Button>
      </Link>
    </div>
  );
}

function SuccessMessage({ message }) {
  return (
    <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
      <p className="text-sm text-green-800">{message}</p>
    </div>
  );
}

function PortfolioHeader({ portfolio, portfolioId }) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">{portfolio.name}</h2>
        {portfolio.description && <p className="text-gray-600">{portfolio.description}</p>}
      </div>
      <Link to={`/holdings/add`} state={{ portfolioId }}>
        <Button>
          <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Holding
        </Button>
      </Link>
    </div>
  );
}

function HoldingsTable({ holdings, portfolioId }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {["Symbol", "Quantity", "Avg Price", "Current Price", "Value", "P/L", "Actions"].map((title) => (
                <th key={title} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {holdings.map(h => (
              <HoldingRow key={h._id || h.id} holding={h} portfolioId={portfolioId} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioStats({ totalInvestment, currentValue, totalPL, portfolio }) {
  const hasCurrentPrice = portfolio.holdings.some(h => h.currentPrice);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <StatCard label="Total Investment" value={totalInvestment} />
      {hasCurrentPrice && (
        <>
          <StatCard label="Current Value" value={currentValue} />
          <StatCard label="Total P/L" value={totalPL} isPL />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, isPL = false }) {
  const formattedValue = `$${value.toFixed(2)}`;
  const isPositive = value >= 0;

  const bgClass = isPL
    ? isPositive ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
    : 'border-gray-200 bg-white';
  const textClass = isPL
    ? isPositive ? 'text-green-600' : 'text-red-600'
    : 'text-gray-900';

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${bgClass}`}>
      <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textClass}`}>{isPL && isPositive ? `+${formattedValue}` : formattedValue}</p>
    </div>
  );
}

function EmptyPortfolio({ portfolioId }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
      <div className="max-w-md mx-auto">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No holdings yet</h3>
        <p className="text-gray-600 mb-6">Get started by adding your first holding to this portfolio.</p>
        <Link to={`/holdings/add`} state={{ portfolioId }}>
          <Button>Add Your First Holding</Button>
        </Link>
      </div>
    </div>
  );
}

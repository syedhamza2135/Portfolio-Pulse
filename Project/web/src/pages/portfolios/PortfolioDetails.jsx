import { Link, useParams, useLocation } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import HoldingRow from "../../components/portfolio/HoldingRow";
import Button from "../../components/ui/Button";

export default function PortfolioDetails() {
  const { id } = useParams();
  const location = useLocation();
  const successMessage = location.state?.message;
  
  const { data: portfolio, loading, error, refetch } = useFetch(`/portfolios/${id}`);

  if (loading) {
    return <p>Loading portfolio...</p>;
  }

  if (error) {
    return (
      <div>
        <p>Error: {error}</p>
        <Button onClick={refetch}>Try Again</Button>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div>
        <p>Portfolio not found</p>
        <Link to="/portfolios">Back to Portfolios</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-medium">Error loading portfolio</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
        <Button onClick={refetch}>Try Again</Button>
      </div>
    );
  }

  if (!portfolio) {
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

  const totalInvestment = portfolio.holdings?.reduce((sum, h) => sum + (h.quantity * h.averageCost), 0) || 0;
  const currentValue = portfolio.holdings?.reduce((sum, h) => sum + (h.currentPrice ? h.quantity * h.currentPrice : h.quantity * h.averageCost), 0) || 0;
  const totalPL = portfolio.holdings?.reduce((sum, h) => {
    const cost = h.quantity * h.averageCost;
    const value = h.currentPrice ? h.quantity * h.currentPrice : cost;
    return sum + (value - cost);
  }, 0) || 0;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{portfolio.name}</h2>
            {portfolio.description && (
              <p className="text-gray-600">{portfolio.description}</p>
            )}
          </div>
          <Link to={`/portfolios/${id}/add`}>
            <Button>
              <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Holding
            </Button>
          </Link>
        </div>
      </div>

      {portfolio.holdings && portfolio.holdings.length > 0 ? (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Current Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      P/L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {portfolio.holdings.map(holding => (
                    <HoldingRow key={holding._id || holding.id} holding={holding} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <p className="text-sm font-medium text-gray-600 mb-1">Total Investment</p>
              <p className="text-2xl font-bold text-gray-900">${totalInvestment.toFixed(2)}</p>
            </div>
            {portfolio.holdings.some(h => h.currentPrice) && (
              <>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <p className="text-sm font-medium text-gray-600 mb-1">Current Value</p>
                  <p className="text-2xl font-bold text-gray-900">${currentValue.toFixed(2)}</p>
                </div>
                <div className={`bg-white rounded-lg shadow-sm border p-6 ${
                  totalPL >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <p className="text-sm font-medium text-gray-600 mb-1">Total P/L</p>
                  <p className={`text-2xl font-bold ${
                    totalPL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No holdings yet</h3>
            <p className="text-gray-600 mb-6">
              Get started by adding your first holding to this portfolio.
            </p>
            <Link to={`/portfolios/${id}/add`}>
              <Button>
                Add Your First Holding
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
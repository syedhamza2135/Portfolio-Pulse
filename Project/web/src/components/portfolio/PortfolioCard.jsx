import { Link } from "react-router-dom";

export default function PortfolioCard({ portfolio }) {
  const holdingsCount = portfolio.holdings?.length || 0;
  
  return (
    <Link 
      to={`/portfolios/${portfolio._id || portfolio.id}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">
          {portfolio.name}
        </h3>
        <div className="flex-shrink-0 ml-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      
      {portfolio.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {portfolio.description}
        </p>
      )}
      
      <div className="flex items-center text-sm text-gray-500">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <span>{holdingsCount} {holdingsCount === 1 ? 'holding' : 'holdings'}</span>
      </div>
    </Link>
  );
}
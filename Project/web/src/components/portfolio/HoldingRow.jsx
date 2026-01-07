import { Link } from "react-router-dom";

export default function HoldingRow({ holding, portfolioId }) {
  // Calculations
  const totalCost = holding.quantity * holding.averageCost;

  const currentValue = holding.currentPrice != null
    ? holding.quantity * holding.currentPrice
    : null;

  const profitLoss = currentValue != null
    ? currentValue - totalCost
    : null;

  const profitLossPercent = profitLoss != null && totalCost > 0
    ? (profitLoss / totalCost) * 100
    : null;

  const isProfitable = profitLoss != null && profitLoss >= 0;

  // Helper to format currency
  const formatCurrency = (value) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Helper to format percentage
  const formatPercent = (value) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Ticker */}
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm font-semibold text-gray-900">{holding.ticker}</span>
      </td>

      {/* Quantity */}
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm text-gray-900">{holding.quantity.toLocaleString()}</span>
      </td>

      {/* Average Cost */}
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm text-gray-900">{formatCurrency(holding.averageCost)}</span>
      </td>

      {/* Current Price */}
      <td className="px-6 py-4 whitespace-nowrap">
        {holding.currentPrice != null ? (
          <span className="text-sm text-gray-900">{formatCurrency(holding.currentPrice)}</span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      {/* Current Value */}
      <td className="px-6 py-4 whitespace-nowrap">
        {currentValue != null ? (
          <span className="text-sm font-medium text-gray-900">{formatCurrency(currentValue)}</span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      {/* Profit / Loss */}
      <td className="px-6 py-4 whitespace-nowrap">
        {profitLoss != null ? (
          <div className="flex flex-col">
            <span className={`text-sm font-semibold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(profitLoss)}
            </span>
            {profitLossPercent != null && (
              <span className={`text-xs ${isProfitable ? 'text-green-500' : 'text-red-500'}`}>
                ({formatPercent(profitLossPercent)})
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <Link 
          to={`/holdings/${holding._id}/edit`}
          state={{ portfolioId }}
          className="text-blue-600 hover:text-blue-900 transition-colors"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}
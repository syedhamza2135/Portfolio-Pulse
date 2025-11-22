export default function HoldingRow({ holding }) {
  // Keep calculations as numbers, format only for display
  const currentValue = holding.currentPrice 
    ? holding.quantity * holding.currentPrice
    : null;
  
  const totalCost = holding.quantity * holding.averageCost;
  
  const profitLoss = currentValue !== null
    ? currentValue - totalCost
    : null;
  
  const profitLossPercent = profitLoss !== null && totalCost > 0
    ? (profitLoss / totalCost) * 100
    : null;

  const isProfitable = profitLoss !== null && profitLoss > 0;

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm font-semibold text-gray-900">{holding.ticker}</span>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm text-gray-900">{holding.quantity.toLocaleString()}</span>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm text-gray-900">${holding.averageCost.toFixed(2)}</span>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        {holding.currentPrice !== undefined && holding.currentPrice > 0 ? (
          <span className="text-sm text-gray-900">${holding.currentPrice.toFixed(2)}</span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        {currentValue !== null ? (
          <span className="text-sm font-medium text-gray-900">
            ${currentValue.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        {profitLoss !== null ? (
          <div className="flex flex-col">
            <span className={`text-sm font-semibold ${
              isProfitable ? 'text-green-600' : 'text-red-600'
            }`}>
              {isProfitable ? '+' : ''}${Math.abs(profitLoss).toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </span>
            {profitLossPercent !== null && (
              <span className={`text-xs ${
                isProfitable ? 'text-green-500' : 'text-red-500'
              }`}>
                ({isProfitable ? '+' : ''}{profitLossPercent.toFixed(2)}%)
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <button className="text-blue-600 hover:text-blue-900">
          Edit
        </button>
      </td>
    </tr>
  );
}
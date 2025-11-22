import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "../../lib/axios";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function AddHolding() {
  const navigate = useNavigate();
  const { id: portfolioId } = useParams();
  
  const [formData, setFormData] = useState({ 
    symbol: "", 
    qty: "", 
    avgPrice: "",
    currentPrice: ""
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear field error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.symbol.trim()) {
      newErrors.symbol = "Symbol is required";
    } else if (!/^[A-Z]{1,5}$/i.test(formData.symbol)) {
      newErrors.symbol = "Symbol must be 1-5 letters";
    }

    if (!formData.qty || parseFloat(formData.qty) <= 0) {
      newErrors.qty = "Quantity must be greater than 0";
    }

    if (!formData.avgPrice || parseFloat(formData.avgPrice) <= 0) {
      newErrors.avgPrice = "Average price must be greater than 0";
    }

    if (formData.currentPrice && parseFloat(formData.currentPrice) < 0) {
      newErrors.currentPrice = "Current price cannot be negative";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        symbol: formData.symbol.toUpperCase(),
        qty: parseFloat(formData.qty),
        avgPrice: parseFloat(formData.avgPrice),
        currentPrice: formData.currentPrice ? parseFloat(formData.currentPrice) : undefined
      };

      await axios.post(`/holdings`, {
        ...payload,
        portfolioId,
        ticker: payload.symbol,
        quantity: payload.qty,
        averageCost: payload.avgPrice,
        assetType: 'stock' // Default to stock, can be enhanced later
      });
      navigate(`/portfolios/${portfolioId}`);
    } catch (err) {
      console.error("Failed to add holding:", err);
      setApiError(err.response?.data?.message || "Failed to add holding");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(`/portfolios/${portfolioId}`);
  };

  // Calculate preview values
  const totalCost = formData.qty && formData.avgPrice 
    ? (parseFloat(formData.qty) * parseFloat(formData.avgPrice)).toFixed(2)
    : null;

  const currentValue = formData.qty && formData.currentPrice
    ? (parseFloat(formData.qty) * parseFloat(formData.currentPrice)).toFixed(2)
    : null;

  const profitLoss = totalCost && currentValue
    ? (parseFloat(currentValue) - parseFloat(totalCost)).toFixed(2)
    : null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Add Holding</h2>
        <p className="text-gray-600">Add a new holding to your portfolio</p>
      </div>

      {apiError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{apiError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Symbol"
            name="symbol"
            value={formData.symbol}
            onChange={handleChange}
            error={errors.symbol}
            required
            helperText="Stock ticker symbol (e.g., AAPL)"
            className="uppercase"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Asset Type
            </label>
            <select
              name="assetType"
              value="stock"
              disabled
              className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            >
              <option value="stock">Stock</option>
            </select>
            <p className="mt-1.5 text-sm text-gray-500">Default: Stock (Crypto & ETF coming soon)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Quantity"
            name="qty"
            type="number"
            value={formData.qty}
            onChange={handleChange}
            error={errors.qty}
            required
            min="0"
            step="1"
            helperText="Number of shares"
          />

          <Input
            label="Average Price"
            name="avgPrice"
            type="number"
            value={formData.avgPrice}
            onChange={handleChange}
            error={errors.avgPrice}
            required
            min="0"
            step="0.01"
            helperText="Average purchase price per share"
          />
        </div>

        <Input
          label="Current Price (Optional)"
          name="currentPrice"
          type="number"
          value={formData.currentPrice}
          onChange={handleChange}
          error={errors.currentPrice}
          min="0"
          step="0.01"
          helperText="Current market price per share"
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Adding..." : "Add Holding"}
          </Button>
          <Button 
            type="button" 
            variant="secondary" 
            onClick={handleCancel} 
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </form>

      {totalCost && (
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Total Cost:</span>
              <span className="text-lg font-semibold text-gray-900">${totalCost}</span>
            </div>
            {currentValue && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Current Value:</span>
                <span className="text-lg font-semibold text-gray-900">${currentValue}</span>
              </div>
            )}
            {profitLoss && (
              <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Profit/Loss:</span>
                <span className={`text-lg font-semibold ${
                  parseFloat(profitLoss) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {parseFloat(profitLoss) >= 0 ? '+' : ''}${profitLoss}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
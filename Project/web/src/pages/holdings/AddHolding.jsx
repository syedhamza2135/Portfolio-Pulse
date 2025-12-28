import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "../../lib/axios";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function AddHolding() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get portfolioId from location state (passed from PortfolioDetails)
  const portfolioId = location.state?.portfolioId;
  
  const [formData, setFormData] = useState({ 
    ticker: "", 
    quantity: "", 
    averageCost: "",
    currentPrice: ""
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);

  // Redirect if no portfolioId
  if (!portfolioId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-yellow-800">Invalid access. Please select a portfolio first.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/portfolios')}>
          Go to Portfolios
        </Button>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
    if (apiError) {
      setApiError(null);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.ticker.trim()) {
      newErrors.ticker = "Ticker symbol is required";
    } else if (!/^[A-Z]{1,10}$/i.test(formData.ticker.trim())) {
      newErrors.ticker = "Ticker must be 1-10 letters";
    }

    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "Quantity must be greater than 0";
    }

    if (!formData.averageCost || parseFloat(formData.averageCost) <= 0) {
      newErrors.averageCost = "Average cost must be greater than 0";
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
        portfolioId,
        ticker: formData.ticker.trim().toUpperCase(),
        quantity: parseFloat(formData.quantity),
        averageCost: parseFloat(formData.averageCost),
        assetType: 'stock'
      };

      if (formData.currentPrice && parseFloat(formData.currentPrice) > 0) {
        payload.currentPrice = parseFloat(formData.currentPrice);
      }

      await axios.post('/holdings', payload);
      
      navigate(`/portfolios/${portfolioId}`, {
        state: { message: 'Holding added successfully!' }
      });
      
    } catch (err) {
      console.error("Failed to add holding:", err);
      
      if (err.response) {
        const { status, data } = err.response;
        
        if (status === 400) {
          setApiError(data.error || "Invalid data. Please check your inputs.");
        } else if (status === 401) {
          setApiError("You must be logged in to add holdings.");
        } else if (status === 404) {
          setApiError("Portfolio not found. Please try again.");
        } else if (status === 409) {
          setApiError("This ticker already exists in your portfolio. Try editing it instead.");
        } else {
          setApiError("Failed to add holding. Please try again.");
        }
      } else if (err.request) {
        setApiError("No response from server. Please check your connection.");
      } else {
        setApiError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(`/portfolios/${portfolioId}`);
  };

  // Calculate preview values
  const totalCost = formData.quantity && formData.averageCost 
    ? (parseFloat(formData.quantity) * parseFloat(formData.averageCost)).toFixed(2)
    : null;

  const currentValue = formData.quantity && formData.currentPrice
    ? (parseFloat(formData.quantity) * parseFloat(formData.currentPrice)).toFixed(2)
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
          <div className="flex items-start">
            <svg 
              className="w-5 h-5 text-red-600 mt-0.5 mr-3 shrink-0" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
            <p className="text-sm text-red-800">{apiError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Ticker Symbol"
            name="ticker"
            value={formData.ticker}
            onChange={handleChange}
            error={errors.ticker}
            required
            helperText="Stock ticker (e.g., AAPL, MSFT)"
            className="uppercase"
            maxLength={10}
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
            name="quantity"
            type="number"
            value={formData.quantity}
            onChange={handleChange}
            error={errors.quantity}
            required
            min="0.01"
            step="0.01"
            helperText="Number of shares"
          />

          <Input
            label="Average Cost"
            name="averageCost"
            type="number"
            value={formData.averageCost}
            onChange={handleChange}
            error={errors.averageCost}
            required
            min="0.01"
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

        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            disabled={loading} 
            className="flex-1"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Adding...
              </span>
            ) : (
              "Add Holding"
            )}
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
        <div className="mt-8 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Total Cost:</span>
              <span className="text-lg font-semibold text-gray-900">${totalCost}</span>
            </div>
            {currentValue && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Current Value:</span>
                  <span className="text-lg font-semibold text-gray-900">${currentValue}</span>
                </div>
                {profitLoss && (
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="text-sm font-medium text-gray-600">Profit/Loss:</span>
                    <span className={`text-lg font-semibold ${
                      parseFloat(profitLoss) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {parseFloat(profitLoss) >= 0 ? '+' : ''}${profitLoss}
                      <span className="text-sm ml-2">
                        ({((parseFloat(profitLoss) / parseFloat(totalCost)) * 100).toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
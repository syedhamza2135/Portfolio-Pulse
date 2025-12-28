import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "../../lib/axios";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function EditHolding() {
  const { id: holdingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get portfolioId from location state
  const portfolioId = location.state?.portfolioId;

  const [formData, setFormData] = useState({
    ticker: "",
    quantity: "",
    averageCost: "",
    currentPrice: "",
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    const fetchHolding = async () => {
      try {
        const response = await axios.get(`/holdings/${holdingId}`);
        const holding = response.data;
        
        setFormData({
          ticker: holding.ticker || "",
          quantity: holding.quantity || "",
          averageCost: holding.averageCost || "",
          currentPrice: holding.currentPrice || "",
        });
      } catch (error) {
        console.error("Failed to fetch holding:", error);
        setApiError(error.response?.data?.error || "Failed to load holding");
      } finally {
        setLoading(false);
      }
    };

    if (holdingId) {
      fetchHolding();
    } else {
      setLoading(false);
    }
  }, [holdingId]);

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

    const qty = parseFloat(formData.quantity);
    if (!formData.quantity || isNaN(qty) || qty <= 0) {
      newErrors.quantity = "Quantity must be greater than 0";
    }

    const avgCost = parseFloat(formData.averageCost);
    if (!formData.averageCost || isNaN(avgCost) || avgCost <= 0) {
      newErrors.averageCost = "Average cost must be greater than 0";
    }

    if (formData.currentPrice) {
      const currentPrice = parseFloat(formData.currentPrice);
      if (isNaN(currentPrice) || currentPrice < 0) {
        newErrors.currentPrice = "Current price cannot be negative";
      }
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

    setSubmitting(true);

    try {
      const payload = {
        quantity: parseFloat(formData.quantity),
        averageCost: parseFloat(formData.averageCost),
      };

      if (formData.currentPrice && parseFloat(formData.currentPrice) > 0) {
        payload.currentPrice = parseFloat(formData.currentPrice);
      }

      await axios.put(`/holdings/${holdingId}`, payload);
      
      // Navigate back to portfolio
      if (portfolioId) {
        navigate(`/portfolios/${portfolioId}`, {
          state: { message: 'Holding updated successfully!' }
        });
      } else {
        navigate('/portfolios');
      }
    } catch (error) {
      console.error("Failed to update holding:", error);
      setApiError(error.response?.data?.error || "Failed to update holding");
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (portfolioId) {
      navigate(`/portfolios/${portfolioId}`);
    } else {
      navigate('/portfolios');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${formData.ticker}? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setApiError(null);

    try {
      await axios.delete(`/holdings/${holdingId}`);
      
      if (portfolioId) {
        navigate(`/portfolios/${portfolioId}`, {
          state: { message: 'Holding deleted successfully!' }
        });
      } else {
        navigate('/portfolios');
      }
    } catch (error) {
      console.error("Failed to delete holding:", error);
      setApiError(error.response?.data?.error || "Failed to delete holding");
      setDeleting(false);
    }
  };

  // Calculate summary values
  const qty = parseFloat(formData.quantity);
  const avgCost = parseFloat(formData.averageCost);
  const currentPrice = parseFloat(formData.currentPrice);

  const totalCost = !isNaN(qty) && !isNaN(avgCost) ? qty * avgCost : null;
  const currentValue = !isNaN(qty) && !isNaN(currentPrice) ? qty * currentPrice : null;
  const profitLoss = totalCost !== null && currentValue !== null ? currentValue - totalCost : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading holding...</p>
        </div>
      </div>
    );
  }

  if (apiError && !formData.ticker) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600 text-sm mt-1">{apiError}</p>
        </div>
        <Button variant="secondary" onClick={handleCancel}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Holding</h1>
        <p className="text-gray-600">Update holding details for {formData.ticker}</p>
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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700">
            Ticker Symbol: <span className="text-lg font-bold text-gray-900">{formData.ticker}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">Ticker symbol cannot be changed</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input
            label="Quantity"
            name="quantity"
            type="number"
            value={formData.quantity}
            onChange={handleChange}
            error={errors.quantity}
            placeholder="100"
            required
            min="0.01"
            step="0.01"
            helperText="Number of shares owned"
          />

          <Input
            label="Average Cost"
            name="averageCost"
            type="number"
            value={formData.averageCost}
            onChange={handleChange}
            error={errors.averageCost}
            placeholder="150.00"
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
          placeholder="175.50"
          min="0"
          step="0.01"
          helperText="Current market price per share"
        />

        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            disabled={submitting || deleting} 
            className="flex-1"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>

          <Button 
            type="button" 
            variant="secondary" 
            onClick={handleCancel} 
            disabled={submitting || deleting}
          >
            Cancel
          </Button>

          <Button 
            type="button" 
            variant="danger" 
            onClick={handleDelete} 
            disabled={submitting || deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </form>

      {totalCost !== null && (
        <div className="mt-8 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">Total Cost:</span>
              <span className="text-lg font-semibold text-gray-900">${totalCost.toFixed(2)}</span>
            </div>
            {currentValue !== null && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Current Value:</span>
                  <span className="text-lg font-semibold text-gray-900">${currentValue.toFixed(2)}</span>
                </div>
                {profitLoss !== null && (
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="text-sm font-medium text-gray-600">Profit/Loss:</span>
                    <span className={`text-lg font-semibold ${
                      profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
                      <span className="text-sm ml-2">
                        ({((profitLoss / totalCost) * 100).toFixed(2)}%)
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
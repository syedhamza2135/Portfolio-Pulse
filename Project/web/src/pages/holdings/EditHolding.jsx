import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../../lib/axios";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function EditHolding() {
  const { portfolioId, holdingId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    symbol: "",
    qty: "",
    avgPrice: "",
    currentPrice: "",
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    const fetchHolding = async () => {
      try {
        const response = await axios.get(`/portfolios/${portfolioId}/holdings/${holdingId}`);
        const holding = response.data;
        
        setFormData({
          symbol: holding.symbol || "",
          qty: holding.qty || "",
          avgPrice: holding.avgPrice || "",
          currentPrice: holding.currentPrice || "",
        });
      } catch (error) {
        console.error("Failed to fetch holding:", error);
        setApiError(error.response?.data?.message || "Failed to load holding");
      } finally {
        setLoading(false);
      }
    };

    if (portfolioId && holdingId) {
      fetchHolding();
    } else {
      setLoading(false);
    }
  }, [portfolioId, holdingId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
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

    const qty = parseFloat(formData.qty);
    if (!formData.qty || isNaN(qty) || qty <= 0) {
      newErrors.qty = "Quantity must be greater than 0";
    }

    const avgPrice = parseFloat(formData.avgPrice);
    if (!formData.avgPrice || isNaN(avgPrice) || avgPrice <= 0) {
      newErrors.avgPrice = "Average price must be greater than 0";
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
        symbol: formData.symbol.toUpperCase(),
        qty: parseFloat(formData.qty),
        avgPrice: parseFloat(formData.avgPrice),
        currentPrice: formData.currentPrice ? parseFloat(formData.currentPrice) : undefined,
      };

      await axios.put(`/portfolios/${portfolioId}/holdings/${holdingId}`, payload);
      navigate(`/portfolios/${portfolioId}`);
    } catch (error) {
      console.error("Failed to update holding:", error);
      setApiError(error.response?.data?.message || "Failed to update holding");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(`/portfolios/${portfolioId}`);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${formData.symbol}?`)) {
      return;
    }

    setSubmitting(true);

    try {
      await axios.delete(`/portfolios/${portfolioId}/holdings/${holdingId}`);
      navigate(`/portfolios/${portfolioId}`);
    } catch (error) {
      console.error("Failed to delete holding:", error);
      setApiError(error.response?.data?.message || "Failed to delete holding");
      setSubmitting(false);
    }
  };

  // Calculate summary values
  const qty = parseFloat(formData.qty);
  const avgPrice = parseFloat(formData.avgPrice);
  const currentPrice = parseFloat(formData.currentPrice);

  const totalCost = !isNaN(qty) && !isNaN(avgPrice) ? qty * avgPrice : null;
  const currentValue = !isNaN(qty) && !isNaN(currentPrice) ? qty * currentPrice : null;
  const profitLoss = totalCost !== null && currentValue !== null ? currentValue - totalCost : null;

  if (loading) {
    return (
      <div>
        <p>Loading holding...</p>
      </div>
    );
  }

  if (apiError && !formData.symbol) {
    return (
      <div>
        <p>{apiError}</p>
        <Button variant="secondary" onClick={handleCancel}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1>Edit Holding</h1>
      <p>Update holding details</p>

      {apiError && <p>{apiError}</p>}

      <form onSubmit={handleSubmit}>
        <Input
          label="Symbol"
          name="symbol"
          value={formData.symbol}
          onChange={handleChange}
          error={errors.symbol}
          placeholder="AAPL"
          required
          helperText="Stock ticker symbol (e.g., AAPL, MSFT)"
        />

        <Input
          label="Quantity"
          name="qty"
          type="number"
          value={formData.qty}
          onChange={handleChange}
          error={errors.qty}
          placeholder="100"
          required
          min="0"
          step="1"
          helperText="Number of shares owned"
        />

        <Input
          label="Average Price"
          name="avgPrice"
          type="number"
          value={formData.avgPrice}
          onChange={handleChange}
          error={errors.avgPrice}
          placeholder="150.00"
          required
          min="0"
          step="0.01"
          helperText="Average purchase price per share"
        />

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

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>

          <Button type="button" variant="secondary" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>

          <Button type="button" variant="danger" onClick={handleDelete} disabled={submitting}>
            Delete
          </Button>
        </div>
      </form>

      {totalCost !== null && (
        <div>
          <h3>Summary</h3>
          <div>
            <p>Total Cost: ${totalCost.toFixed(2)}</p>
            {currentValue !== null && (
              <>
                <p>Current Value: ${currentValue.toFixed(2)}</p>
                <p>
                  Profit/Loss: {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
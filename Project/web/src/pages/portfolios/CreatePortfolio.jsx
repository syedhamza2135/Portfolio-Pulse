import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import axios from "../../lib/axios";

export default function CreatePortfolio() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ 
    name: "", 
    description: "" 
  });

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      newErrors.name = "Portfolio name is required";
    } else if (trimmedName.length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    } else if (trimmedName.length > 50) {
      newErrors.name = "Name must be less than 50 characters";
    }

    if (formData.description && formData.description.length > 200) {
      newErrors.description = "Description must be less than 200 characters";
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
        name: formData.name.trim(),
      };
      
      // Only include description if it's not empty
      if (formData.description.trim()) {
        payload.description = formData.description.trim();
      }

      const response = await axios.post("/portfolios", payload);

      navigate(`/portfolios/${response.data.id || response.data._id}`, {
        state: { message: "Portfolio created successfully!" }
      });
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || "Failed to create portfolio";
      setApiError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/portfolios");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Portfolio</h1>
        <p className="text-gray-600">Add a new portfolio to track your investments</p>
      </div>

      {apiError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{apiError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Portfolio Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          placeholder="My Investment Portfolio"
          required
          helperText="Give your portfolio a descriptive name"
        />

        <div>
          <label 
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            Description
            <span className="text-gray-400 font-normal ml-1">(Optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional description of your portfolio strategy..."
            rows={4}
            className={`
              block w-full rounded-lg border px-3 py-2 text-sm
              placeholder:text-gray-400
              focus:outline-none focus:ring-2 focus:ring-offset-0
              transition-colors duration-150
              ${errors.description
                ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-300'
                : 'border-gray-300 text-gray-900 focus:border-sky-500 focus:ring-sky-300'
              }
            `}
          />
          {errors.description && (
            <p className="mt-1.5 text-sm text-red-600">{errors.description}</p>
          )}
          {!errors.description && (
            <p className="mt-1.5 text-sm text-gray-500">
              {formData.description.length}/200 characters
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Creating..." : "Create Portfolio"}
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

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Portfolio Tips
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Use descriptive names to identify portfolios easily</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Group similar investments together</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5">•</span>
            <span>Add holdings after creating your portfolio</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
import axios from "axios";

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401) {
        return Promise.reject(error);
      }

      // Log errors in development only
      if (import.meta.env.DEV) {
        const errorMessage = data?.error || data?.message || 'Unknown error';
        console.error(`Error ${status}:`, errorMessage);
      }
    } else if (error.request) {
      console.error("Network error - no response from server");
    } else {
      console.error("Request error:", error.message);
    }

    return Promise.reject(error);
  }
);

export default instance;
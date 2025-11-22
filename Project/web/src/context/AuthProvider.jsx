import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AuthContext } from "./AuthContext";
import axios from "../lib/axios";

export default function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const logoutRef = useRef();

  // Initialize auth on mount - validate token
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem("token");
      
      if (storedToken) {
        try {
          // Always validate token on app load
          const res = await axios.get("/auth/me", {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          setUser(res.data);
          setToken(storedToken);
          localStorage.setItem("user", JSON.stringify(res.data));
        } catch (err) {
          console.error("Token validation failed:", err);
          // Token is invalid, clear auth state
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setToken(null);
          setUser(null);
        }
      }
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // Set up axios response interceptor for auto-logout on 401
  useEffect(() => {
    if (loading) return; // Don't set up interceptors until auth is initialized

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Auto logout on 401 Unauthorized
        if (error.response?.status === 401 && logoutRef.current) {
          logoutRef.current();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [loading]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await axios.post("/auth/login", { email, password });
      const { token: newToken, user: newUser } = res.data;
      
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(newUser));
      
      return { success: true };
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || "Login failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await axios.post("/auth/register", data);
      return { success: true, message: res.data?.message };
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || "Registration failed";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setError(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }, []);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token,
      loading,
      error,
      login,
      register,
      logout,
      clearError,
      updateUser,
    }),
    [token, user, loading, error, login, register, logout, clearError, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
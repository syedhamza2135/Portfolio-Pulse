import PublicRoute from "../components/layout/PublicRoute.jsx";
import Login from "../pages/auth/Login.jsx";
import Register from "../pages/auth/Register.jsx";
import Dashboard from "../pages/dashboard/Dashboard.jsx";
import PortfolioList from "../pages/portfolios/PortfolioList.jsx";
import PortfolioDetails from "../pages/portfolios/PortfolioDetails.jsx";
import AddHolding from "../pages/holdings/AddHolding";
import CreatePortfolio from "../pages/portfolios/CreatePortfolio.jsx";
import ProtectedRoute from "../components/layout/ProtectedRoute.jsx";

import { Routes, Route, Navigate } from "react-router-dom";


export default function AppRouter() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolios"
        element={
          <ProtectedRoute>
            <PortfolioList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolios/:id"
        element={
          <ProtectedRoute>
            <PortfolioDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolios/:id/add"
        element={
          <ProtectedRoute>
            <AddHolding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolios/create"
        element={
          <ProtectedRoute>
            <CreatePortfolio />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
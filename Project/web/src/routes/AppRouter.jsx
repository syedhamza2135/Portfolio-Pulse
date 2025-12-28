import { Routes, Route, Navigate } from "react-router-dom";
import PublicRoute from "../components/layout/PublicRoute.jsx";
import ProtectedRoute from "../components/layout/ProtectedRoute.jsx";
import Login from "../pages/auth/Login.jsx";
import Register from "../pages/auth/Register.jsx";
import Dashboard from "../pages/dashboard/Dashboard.jsx";
import PortfolioList from "../pages/portfolios/PortfolioList.jsx";
import PortfolioDetails from "../pages/portfolios/PortfolioDetails.jsx";
import CreatePortfolio from "../pages/portfolios/CreatePortfolio.jsx";
import AddHolding from "../pages/holdings/AddHolding";
import EditHolding from "../pages/holdings/EditHolding";

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
      
      {/* Portfolio routes */}
      <Route
        path="/portfolios"
        element={
          <ProtectedRoute>
            <PortfolioList />
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
      <Route
        path="/portfolios/:id"
        element={
          <ProtectedRoute>
            <PortfolioDetails />
          </ProtectedRoute>
        }
      />
      
      {/* Holding routes - using /holdings/:id structure */}
      <Route
        path="/holdings/add"
        element={
          <ProtectedRoute>
            <AddHolding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/holdings/:id/edit"
        element={
          <ProtectedRoute>
            <EditHolding />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/layout/ProtectedRoute";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import Dashboard from "../pages/dashboard/Dashboard";
import PortfolioList from "../pages/portfolios/PortfolioList";
import PortfolioDetails from "../pages/portfolios/PortfolioDetails";
import CreatePortfolio from "../pages/portfolios/CreatePortfolio";
import AddHolding from "../pages/holdings/AddHolding";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

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
        path="/portfolio/:id"
        element={
          <ProtectedRoute>
            <PortfolioDetails />
          </ProtectedRoute>
        }
      />

      <Route
        path="/portfolio/:id/add"
        element={
          <ProtectedRoute>
            <AddHolding />
          </ProtectedRoute>
        }
      />

      <Route path="/create-portfolio" element={<CreatePortfolio />} />
    </Routes>
  );
}
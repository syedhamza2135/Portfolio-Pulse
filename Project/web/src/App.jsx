import { useAuth } from "./hooks/useAuth";
import AppRouter from "./routes/AppRouter";
import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Authenticated layout with sidebar and navbar
  if (isAuthenticated) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar />

          <main className="flex-1 overflow-y-auto bg-white">
            <AppRouter />
          </main>
        </div>
      </div>
    );
  }

  // Unauthenticated layout (login/register pages)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <AppRouter />
    </div>
  );
}
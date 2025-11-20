import AppRouter from "./routes/AppRouter";
import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { token } = useAuth();

  // Layout only when user is logged in
  return (
    <div className="flex h-screen">
      {token && <Sidebar />}
      <div className="flex-1 flex flex-col">
        {token && <Navbar />}
        <div className="flex-1 overflow-auto">
          <AppRouter />
        </div>
      </div>
    </div>
  );
}
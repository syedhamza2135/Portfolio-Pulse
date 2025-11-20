import { useAuth } from "../../hooks/useAuth";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="w-full bg-white shadow px-6 py-3 flex justify-between items-center">
      <h1 className="font-bold text-xl">Portfolio Tracker</h1>
      <div className="flex items-center gap-4">
        <span className="text-gray-600">{user?.name}</span>
        <button onClick={logout} className="text-red-600">Logout</button>
      </div>
    </nav>
  );
}
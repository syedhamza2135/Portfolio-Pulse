import { Link } from "react-router-dom";

export default function Sidebar() {
  return (
    <aside className="w-60 bg-gray-100 h-screen p-4 border-r">
      <nav className="flex flex-col gap-3">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/portfolios">Portfolios</Link>
      </nav>
    </aside>
  );
}
import { Link } from "react-router-dom";

export default function PortfolioCard({ portfolio }) {
  return (
    <Link
      to={`/portfolio/${portfolio._id}`}
      className="p-4 border rounded shadow-sm hover:bg-gray-50"
    >
      <h3 className="font-semibold text-lg">{portfolio.name}</h3>
      <p className="text-sm text-gray-600">{portfolio.description}</p>
    </Link>
  );
}
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "../../lib/axios";
import HoldingRow from "../../components/portfolio/HoldingRow";

export default function PortfolioDetails() {
  const { id } = useParams();
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    axios.get(`/portfolios/${id}`).then(res => setPortfolio(res.data));
  }, [id]);

  if (!portfolio) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold">{portfolio.name}</h2>
      <table className="mt-4 w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Symbol</th>
            <th className="p-2">Qty</th>
            <th className="p-2">Avg Price</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.holdings.map(h => (
            <HoldingRow key={h._id} holding={h} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
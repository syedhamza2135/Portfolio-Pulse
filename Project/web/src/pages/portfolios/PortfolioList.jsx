import { useEffect, useState } from "react";
import axios from "../../lib/axios";
import PortfolioCard from "../../components/portfolio/PortfolioCard";

export default function PortfolioList() {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("/portfolios").then(res => setData(res.data));
  }, []);

  return (
    <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2">
      {data.map(p => (
        <PortfolioCard key={p._id} portfolio={p} />
      ))}
    </div>
  );
}
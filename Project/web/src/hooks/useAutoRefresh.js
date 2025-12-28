import { useEffect } from "react";
import useFetch from './useFetch.js'

 export default function useAutoRefresh(portfolioId, interval = 30000) {
  const { data, refetch } = useFetch(`/portfolios/${portfolioId}`);
  
  useEffect(() => {
    const timer = setInterval(() => {
      refetch();
    }, interval);
    
    return () => clearInterval(timer);
  }, [refetch, interval]);
  
  return data;
}
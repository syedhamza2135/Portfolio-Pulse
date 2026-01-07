import { useEffect } from "react";
import useFetch from './useFetch.js';

export default function useAutoRefresh(portfolioId, interval = 30000) {
  // Always return an object with these fields
  const { data, loading, error, refetch } = useFetch(
    portfolioId ? `/portfolios/${portfolioId}` : null
  );

  useEffect(() => {
    if (!refetch) return; // skip if refetch is undefined
    const timer = setInterval(() => {
      refetch();
    }, interval);

    return () => clearInterval(timer);
  }, [refetch, interval]);

  return {
    data: data || null,
    loading: loading ?? false,
    error: error ?? null,
    refetch: refetch ?? (() => {}),
  };
}
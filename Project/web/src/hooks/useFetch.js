import { useEffect, useState, useCallback, useRef } from "react";
import axios from "../lib/axios";

export default function useFetch(url, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const { skip = false } = options;

  // Use refs for callbacks
  const onSuccessRef = useRef();
  const onErrorRef = useRef();

  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
    onErrorRef.current = options.onError;
  }, [options.onSuccess, options.onError]);

  // Manual refetch function
  const refetch = useCallback(() => {
    setRefetchCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      if (!url || skip) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await axios.get(url);
        
        if (!ignore) {
          setData(res.data);
          
          if (onSuccessRef.current) {
            onSuccessRef.current(res.data);
          }
        }
      } catch (err) {
        if (!ignore) {
          const errorMessage = err.response?.data?.message || err.message || "Failed to fetch data";
          setError(errorMessage);
          
          if (onErrorRef.current) {
            onErrorRef.current(err);
          }
          
          console.error(`Error fetching ${url}:`, err);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      ignore = true;
    };
  }, [url, skip, refetchCount]);

  return { 
    data, 
    loading, 
    error, 
    refetch
  };
}
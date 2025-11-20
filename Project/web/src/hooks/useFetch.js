import axios from "../lib/axios";
import { useEffect, useState } from "react";

export default function useFetch(url) {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get(url).then(res => setData(res.data));
  }, [url]);

  return data;
}
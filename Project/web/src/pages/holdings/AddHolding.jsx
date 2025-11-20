import { useState } from "react";
import { useParams } from "react-router-dom";
import axios from "../../lib/axios";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

export default function AddHolding() {
  const { id } = useParams();
  const [form, setForm] = useState({ symbol: "", qty: "", avgPrice: "" });

  const submit = async (e) => {
    e.preventDefault();
    await axios.post(`/holdings/${id}`, form);
    window.history.back();
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold mb-4">Add Holding</h2>
      <form onSubmit={submit}>
        <Input label="Symbol" onChange={e => setForm({...form, symbol: e.target.value})} />
        <Input label="Qty" type="number" onChange={e => setForm({...form, qty: e.target.value})} />
        <Input label="Avg Price" type="number" onChange={e => setForm({...form, avgPrice: e.target.value})} />
        <Button>Add</Button>
      </form>
    </div>
  );
}
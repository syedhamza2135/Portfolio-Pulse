import { useState } from "react";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import axios from "../../lib/axios";
import { useNavigate } from "react-router-dom";

export default function CreatePortfolio() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", description: "" });

  const submit = async (e) => {
    e.preventDefault();
    await axios.post("/portfolios", form);
    nav("/portfolios");
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold mb-4">Create Portfolio</h2>
      <form onSubmit={submit}>
        <Input label="Name" onChange={e => setForm({...form, name: e.target.value})} />
        <Input label="Description" onChange={e => setForm({...form, description: e.target.value})} />
        <Button>Create</Button>
      </form>
    </div>
  );
}
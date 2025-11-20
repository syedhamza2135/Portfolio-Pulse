import { useState } from "react";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const submit = (e) => {
    e.preventDefault();
    register(form);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded">
      <h2 className="text-xl font-bold mb-4">Register</h2>
      <form onSubmit={submit}>
        <Input label="Name" onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input label="Email" type="email" onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" onChange={e => setForm({ ...form, password: e.target.value })} />
        <Button type="submit">Register</Button>
      </form>
    </div>
  );
}

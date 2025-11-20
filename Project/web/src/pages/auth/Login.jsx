import { useState } from "react";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });

  const submit = (e) => {
    e.preventDefault();
    login(form.email, form.password);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded">
      <h2 className="text-xl font-bold mb-4">Login</h2>
      <form onSubmit={submit}>
        <Input label="Email" type="email" onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" onChange={e => setForm({ ...form, password: e.target.value })} />
        <Button type="submit">Login</Button>
      </form>
    </div>
  );
}
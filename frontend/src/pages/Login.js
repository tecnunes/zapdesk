import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircleHeart, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      toast.success("Bem-vindo à ZapDesk!");
      navigate("/");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0B0F17]">
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden border-r border-slate-800"
        style={{ background: "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.12), transparent 45%), radial-gradient(circle at 80% 70%, rgba(99,102,241,0.10), transparent 45%)" }}>
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-11 w-11 rounded-2xl bg-emerald-500 text-white">
            <MessageCircleHeart className="h-6 w-6" />
          </div>
          <span className="font-display font-extrabold text-2xl text-white">ZapDesk</span>
        </div>
        <div>
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold text-white leading-tight tracking-tight">
            Toda a sua central de<br /><span className="text-emerald-400">atendimento WhatsApp</span><br />em um só lugar.
          </h1>
          <p className="text-slate-400 mt-6 max-w-md text-base leading-relaxed">
            Caixa de entrada unificada, chatbot com IA, respostas rápidas, gestão de atendentes,
            contatos e gravações de ligações.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-slate-500">
          <span>💬 Chatbot + IA</span><span>👥 Multiatendentes</span><span>📊 Relatórios</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="grid place-items-center h-10 w-10 rounded-xl bg-emerald-500 text-white"><MessageCircleHeart className="h-5 w-5" /></div>
            <span className="font-display font-extrabold text-xl text-white">ZapDesk</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-white">
            {mode === "login" ? "Entrar na conta" : "Criar conta"}
          </h2>
          <p className="text-slate-400 text-sm mt-1 mb-6">
            {mode === "login" ? "Acesse o painel de atendimento" : "Comece a atender em minutos"}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-slate-300">Nome</Label>
                <Input data-testid="name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required className="bg-slate-900 border-slate-700 text-slate-100" placeholder="Seu nome" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-slate-300">E-mail</Label>
              <Input data-testid="email-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                required className="bg-slate-900 border-slate-700 text-slate-100" placeholder="voce@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label className="text-slate-300">Senha</Label>
                {mode === "login" && <Link to="/forgot-password" className="text-xs text-emerald-400 hover:underline" data-testid="forgot-link">Esqueceu?</Link>}
              </div>
              <Input data-testid="password-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                required className="bg-slate-900 border-slate-700 text-slate-100" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-red-400" data-testid="auth-error">{error}</p>}
            <Button data-testid="submit-auth" type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <p className="text-sm text-slate-500 mt-6 text-center">
            {mode === "login" ? "Não tem conta?" : "Já tem conta?"}{" "}
            <button data-testid="toggle-mode" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-emerald-400 font-semibold hover:underline">
              {mode === "login" ? "Cadastre-se" : "Entrar"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatApiErrorDetail } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Senha redefinida! Faça login.");
      navigate("/login");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] p-6">
      <div className="w-full max-w-sm">
        <h2 className="font-display text-2xl font-bold text-white">Nova senha</h2>
        <p className="text-slate-400 text-sm mt-1 mb-6">Escolha uma nova senha para sua conta.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300">Nova senha</Label>
            <Input data-testid="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={6} className="bg-slate-900 border-slate-700 text-slate-100" placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button data-testid="reset-submit" type="submit" disabled={loading || !token} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Redefinir senha
          </Button>
        </form>
        <Link to="/login" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 mt-6">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}

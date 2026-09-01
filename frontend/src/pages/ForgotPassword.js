import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { formatApiErrorDetail } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMsg(data.message); setSent(true);
    } catch (err) {
      setMsg(formatApiErrorDetail(err.response?.data?.detail));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F17] p-6">
      <div className="w-full max-w-sm">
        <h2 className="font-display text-2xl font-bold text-white">Redefinir senha</h2>
        <p className="text-slate-400 text-sm mt-1 mb-6">Enviaremos um link de redefinição para seu e-mail.</p>
        {sent ? (
          <p className="text-emerald-400 text-sm mb-6" data-testid="forgot-confirm">{msg}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300">E-mail</Label>
              <Input data-testid="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required className="bg-slate-900 border-slate-700 text-slate-100" placeholder="voce@empresa.com" />
            </div>
            <Button data-testid="forgot-submit" type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar link
            </Button>
          </form>
        )}
        <Link to="/login" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-400 mt-6">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}

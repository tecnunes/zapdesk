import { useEffect, useState } from "react";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PlugZap, CheckCircle2, AlertCircle, Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function Connection() {
  const [cfg, setCfg] = useState({ phone_number_id: "", access_token: "", verify_token: "", business_phone: "", display_name: "" });
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  const webhookUrl = `${API}/webhooks/whatsapp`;

  const load = () => api.get("/settings/whatsapp").then((r) => { setCfg((c) => ({ ...c, ...r.data, access_token: "" })); setConnected(r.data.connected); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/whatsapp", cfg);
      setConnected(data.connected);
      toast.success(data.connected ? "WhatsApp conectado!" : "Configurações salvas");
      load();
    } catch (e) { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success("Copiado!"); };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Conexão WhatsApp</h1>
        <p className="text-slate-400 text-sm mt-1">Conecte com a API oficial do WhatsApp Business (Meta Cloud API)</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><PlugZap className="h-5 w-5 text-emerald-400" /> Status da conexão</h2>
            {connected
              ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Conectado</Badge>
              : <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertCircle className="h-3.5 w-3.5" /> Modo demonstração</Badge>}
          </div>
          {!connected && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-5">
              <p className="text-sm text-amber-200/90">Sem credenciais, o sistema funciona em <strong>modo demonstração</strong> — você pode simular mensagens de clientes na Caixa de Entrada. Insira suas credenciais da Meta para enviar/receber mensagens reais.</p>
            </div>
          )}
          <div className="space-y-3">
            <div><Label className="text-slate-300">Phone Number ID</Label><Input data-testid="wa-phone-id" value={cfg.phone_number_id} onChange={(e) => setCfg({ ...cfg, phone_number_id: e.target.value })} placeholder="Ex: 123456789012345" className="bg-slate-900 border-slate-700" /></div>
            <div><Label className="text-slate-300">Access Token {cfg.access_token_set && <span className="text-emerald-400 text-xs">(já salvo)</span>}</Label><Input data-testid="wa-token" type="password" value={cfg.access_token} onChange={(e) => setCfg({ ...cfg, access_token: e.target.value })} placeholder="System User token" className="bg-slate-900 border-slate-700" /></div>
            <div><Label className="text-slate-300">Verify Token</Label><Input data-testid="wa-verify" value={cfg.verify_token} onChange={(e) => setCfg({ ...cfg, verify_token: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-slate-300">Número exibido</Label><Input value={cfg.business_phone} onChange={(e) => setCfg({ ...cfg, business_phone: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Nome exibido</Label><Input value={cfg.display_name} onChange={(e) => setCfg({ ...cfg, display_name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
            </div>
            <Button data-testid="save-wa-button" onClick={save} disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-600">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Salvar e conectar
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          <h2 className="font-display font-bold text-lg text-white mb-5">Configurar Webhook na Meta</h2>
          <ol className="space-y-4 text-sm text-slate-300">
            <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">1</span>
              <div>Acesse o painel <span className="text-emerald-400">developers.facebook.com</span> → WhatsApp → Configuration.</div></li>
            <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">2</span>
              <div className="flex-1">Cole esta <strong>Callback URL</strong>:
                <div className="flex items-center gap-2 mt-1.5 bg-slate-900 rounded-lg px-3 py-2">
                  <code className="text-xs text-emerald-400 font-mono flex-1 truncate">{webhookUrl}</code>
                  <button data-testid="copy-webhook" onClick={() => copy(webhookUrl)} className="text-slate-500 hover:text-emerald-400"><Copy className="h-4 w-4" /></button>
                </div>
              </div></li>
            <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">3</span>
              <div className="flex-1">Use o <strong>Verify Token</strong> definido ao lado e assine o campo <span className="font-mono text-emerald-400">messages</span>.</div></li>
            <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">4</span>
              <div>Envie uma mensagem ao número de teste — ela aparecerá na Caixa de Entrada automaticamente.</div></li>
          </ol>
          <div className="mt-6 rounded-lg bg-slate-900 border border-slate-800 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Número conectado</p>
            <p className="font-display font-bold text-white">{cfg.display_name || "ZapDesk Demo"}</p>
            <p className="text-sm text-slate-400 font-mono">{cfg.business_phone || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

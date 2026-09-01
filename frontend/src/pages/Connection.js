import { useEffect, useRef, useState } from "react";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PlugZap, CheckCircle2, AlertCircle, Copy, Loader2, Save, QrCode, RefreshCw, LogOut, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

const PROVIDERS = [
  { value: "meta", label: "Meta (API Oficial)" },
  { value: "360dialog", label: "360dialog (BSP oficial)" },
  { value: "qr", label: "QR Code (WhatsApp Web · não-oficial)" },
];

export default function Connection() {
  const [cfg, setCfg] = useState({ provider: "meta", phone_number_id: "", access_token: "", verify_token: "", business_phone: "", display_name: "" });
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState({ status: "loading", qr: null, me: null });
  const pollRef = useRef(null);

  const webhookUrl = `${API}/webhooks/whatsapp`;

  const load = () => api.get("/settings/whatsapp").then((r) => { setCfg((c) => ({ ...c, ...r.data, access_token: "" })); setConnected(r.data.connected); });
  useEffect(() => { load(); }, []);

  const fetchQr = () => api.get("/whatsapp/qr/status").then((r) => setQr(r.data)).catch(() => setQr({ status: "unavailable", qr: null }));
  useEffect(() => {
    clearInterval(pollRef.current);
    if (cfg.provider === "qr") { fetchQr(); pollRef.current = setInterval(fetchQr, 3000); }
    return () => clearInterval(pollRef.current);
  }, [cfg.provider]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/whatsapp", cfg);
      setConnected(data.connected);
      toast.success("Configurações salvas");
      load();
    } catch (e) { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };
  const logoutQr = async () => { await api.post("/whatsapp/qr/logout"); toast.info("Sessão encerrada. Gerando novo QR…"); setTimeout(fetchQr, 1500); };
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success("Copiado!"); };

  const provider = cfg.provider;

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Conexão WhatsApp</h1>
        <p className="text-slate-400 text-sm mt-1">Escolha como conectar seu número de atendimento</p>
      </div>

      <div className="max-w-md mb-6">
        <Label className="text-slate-300">Provedor de conexão</Label>
        <Select value={provider} onValueChange={(v) => setCfg({ ...cfg, provider: v })}>
          <SelectTrigger data-testid="provider-select" className="bg-slate-900 border-slate-700 text-slate-200 mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#111827] border-slate-700 text-slate-200">
            {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left card */}
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><PlugZap className="h-5 w-5 text-emerald-400" /> Status</h2>
            {provider === "qr"
              ? (qr.status === "connected"
                  ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Conectado</Badge>
                  : <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertCircle className="h-3.5 w-3.5" /> Aguardando</Badge>)
              : (connected
                  ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Conectado</Badge>
                  : <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertCircle className="h-3.5 w-3.5" /> Modo demonstração</Badge>)}
          </div>

          {provider === "meta" && (
            <div className="space-y-3">
              <div><Label className="text-slate-300">Phone Number ID</Label><Input data-testid="wa-phone-id" value={cfg.phone_number_id} onChange={(e) => setCfg({ ...cfg, phone_number_id: e.target.value })} placeholder="Ex: 123456789012345" className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Access Token {cfg.access_token_set && <span className="text-emerald-400 text-xs">(já salvo)</span>}</Label><Input data-testid="wa-token" type="password" value={cfg.access_token} onChange={(e) => setCfg({ ...cfg, access_token: e.target.value })} placeholder="System User token" className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Verify Token</Label><Input data-testid="wa-verify" value={cfg.verify_token} onChange={(e) => setCfg({ ...cfg, verify_token: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
            </div>
          )}

          {provider === "360dialog" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-200/90">
                Provedor <strong>oficial (BSP)</strong> — menor risco de banimento. Use a <strong>API Key</strong> gerada no hub da 360dialog.
              </div>
              <div><Label className="text-slate-300">D360 API Key {cfg.access_token_set && <span className="text-emerald-400 text-xs">(já salva)</span>}</Label><Input data-testid="d360-key" type="password" value={cfg.access_token} onChange={(e) => setCfg({ ...cfg, access_token: e.target.value })} placeholder="D360-API-KEY" className="bg-slate-900 border-slate-700" /></div>
            </div>
          )}

          {provider === "qr" && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200/90 flex gap-2">
              <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" />
              <span>Conexão <strong>não-oficial</strong> (WhatsApp Web). Viola os termos do WhatsApp e há <strong>risco de banimento do número</strong>. Use um número secundário e sem envio em massa.</span>
            </div>
          )}

          {provider !== "qr" && (
            <>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><Label className="text-slate-300">Número exibido</Label><Input value={cfg.business_phone} onChange={(e) => setCfg({ ...cfg, business_phone: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
                <div><Label className="text-slate-300">Nome exibido</Label><Input value={cfg.display_name} onChange={(e) => setCfg({ ...cfg, display_name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              </div>
              <Button data-testid="save-wa-button" onClick={save} disabled={saving} className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Salvar e conectar
              </Button>
            </>
          )}

          {provider === "qr" && (
            <Button data-testid="save-wa-button" onClick={save} disabled={saving} className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Usar QR Code como provedor
            </Button>
          )}
        </div>

        {/* Right card */}
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          {provider === "meta" && (
            <>
              <h2 className="font-display font-bold text-lg text-white mb-5">Configurar Webhook na Meta</h2>
              <ol className="space-y-4 text-sm text-slate-300">
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">1</span><div>Acesse <span className="text-emerald-400">developers.facebook.com</span> → WhatsApp → Configuration.</div></li>
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">2</span>
                  <div className="flex-1">Cole esta <strong>Callback URL</strong>:
                    <div className="flex items-center gap-2 mt-1.5 bg-slate-900 rounded-lg px-3 py-2">
                      <code className="text-xs text-emerald-400 font-mono flex-1 truncate">{webhookUrl}</code>
                      <button data-testid="copy-webhook" onClick={() => copy(webhookUrl)} className="text-slate-500 hover:text-emerald-400"><Copy className="h-4 w-4" /></button>
                    </div>
                  </div></li>
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">3</span><div>Use o <strong>Verify Token</strong> ao lado e assine o campo <span className="font-mono text-emerald-400">messages</span>.</div></li>
              </ol>
            </>
          )}

          {provider === "360dialog" && (
            <>
              <h2 className="font-display font-bold text-lg text-white mb-5">Como usar a 360dialog</h2>
              <ol className="space-y-4 text-sm text-slate-300">
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">1</span><div>Crie a conta em <span className="text-emerald-400">hub.360dialog.com</span> e cadastre seu número comercial.</div></li>
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">2</span><div>Gere a <strong>API Key</strong> e cole ao lado.</div></li>
                <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center text-xs font-bold">3</span>
                  <div className="flex-1">No hub, configure o webhook de recebimento apontando para:
                    <div className="flex items-center gap-2 mt-1.5 bg-slate-900 rounded-lg px-3 py-2">
                      <code className="text-xs text-emerald-400 font-mono flex-1 truncate">{webhookUrl}</code>
                      <button onClick={() => copy(webhookUrl)} className="text-slate-500 hover:text-emerald-400"><Copy className="h-4 w-4" /></button>
                    </div>
                  </div></li>
              </ol>
            </>
          )}

          {provider === "qr" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-400" /> Parear com QR Code</h2>
                <button onClick={fetchQr} className="text-slate-500 hover:text-emerald-400"><RefreshCw className="h-4 w-4" /></button>
              </div>
              <div className="grid place-items-center py-2" data-testid="qr-panel">
                {qr.status === "connected" ? (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center mx-auto mb-3"><CheckCircle2 className="h-8 w-8" /></div>
                    <p className="font-semibold text-white">WhatsApp conectado!</p>
                    <p className="text-sm text-slate-500 font-mono mt-1">{(qr.me || "").split(":")[0]}</p>
                    <Button data-testid="qr-logout" onClick={logoutQr} variant="outline" className="mt-4 border-slate-700 text-slate-300"><LogOut className="h-4 w-4 mr-1.5" /> Desconectar</Button>
                  </div>
                ) : qr.qr ? (
                  <div className="text-center">
                    <div className="bg-white p-3 rounded-xl inline-block"><img src={qr.qr} alt="QR Code" className="h-52 w-52" data-testid="qr-image" /></div>
                    <p className="text-sm text-slate-400 mt-4 max-w-xs">Abra o <strong>WhatsApp</strong> no celular → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong> e aponte para este QR.</p>
                  </div>
                ) : qr.status === "unavailable" ? (
                  <div className="text-center py-10 text-slate-500"><AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-400" /><p className="text-sm">Serviço de QR indisponível.<br />Verifique se o bridge está ativo.</p></div>
                ) : (
                  <div className="text-center py-10 text-slate-500"><Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" /><p className="text-sm">Gerando QR Code…</p></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

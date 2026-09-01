import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Bot, Sparkles, Plus, Trash2, Zap, Save } from "lucide-react";
import { toast } from "sonner";

const emptyRule = { name: "", keywords: "", response: "", enabled: true };

export default function Chatbot() {
  const [settings, setSettings] = useState({ bot_enabled: true, ai_enabled: true, welcome_message: "", away_message: "", ai_system_prompt: "" });
  const [rules, setRules] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const [editId, setEditId] = useState(null);

  const load = () => {
    api.get("/settings/bot").then((r) => setSettings((s) => ({ ...s, ...r.data })));
    api.get("/automations").then((r) => setRules(r.data));
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async () => { await api.put("/settings/bot", settings); toast.success("Configurações salvas"); };

  const saveRule = async () => {
    const payload = { ...form, keywords: typeof form.keywords === "string" ? form.keywords.split(",").map((k) => k.trim()).filter(Boolean) : form.keywords };
    try {
      if (editId) await api.put(`/automations/${editId}`, payload);
      else await api.post("/automations", payload);
      toast.success("Regra salva"); setOpen(false); setForm(emptyRule); setEditId(null); load();
    } catch (e) { toast.error("Erro"); }
  };
  const editRule = (r) => { setForm({ ...r, keywords: (r.keywords || []).join(", ") }); setEditId(r.id); setOpen(true); };
  const delRule = async (id) => { await api.delete(`/automations/${id}`); toast.success("Removida"); load(); };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Chatbot & IA</h1>
        <p className="text-slate-400 text-sm mt-1">Automatize respostas por palavras-chave e com inteligência artificial</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-5">
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-400" /> Configurações gerais</h2>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-slate-200">Chatbot ativo</p><p className="text-xs text-slate-500">Habilita respostas automáticas</p></div>
            <Switch data-testid="toggle-bot-enabled" checked={settings.bot_enabled} onCheckedChange={(v) => setSettings({ ...settings, bot_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-slate-200 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-indigo-400" /> Respostas com IA</p><p className="text-xs text-slate-500">Usa IA quando nenhuma regra corresponder</p></div>
            <Switch data-testid="toggle-ai-enabled" checked={settings.ai_enabled} onCheckedChange={(v) => setSettings({ ...settings, ai_enabled: v })} />
          </div>
          <div><Label className="text-slate-300">Mensagem de boas-vindas</Label><Textarea value={settings.welcome_message} onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })} className="bg-slate-900 border-slate-700 mt-1.5" /></div>
          <div><Label className="text-slate-300">Mensagem fora do horário</Label><Textarea value={settings.away_message} onChange={(e) => setSettings({ ...settings, away_message: e.target.value })} className="bg-slate-900 border-slate-700 mt-1.5" /></div>
          <div><Label className="text-slate-300">Instrução da IA (system prompt)</Label><Textarea value={settings.ai_system_prompt} onChange={(e) => setSettings({ ...settings, ai_system_prompt: e.target.value })} placeholder="Ex: Você é um atendente da loja X, responda de forma amigável…" className="bg-slate-900 border-slate-700 mt-1.5" /></div>
          <Button data-testid="save-bot-settings" onClick={saveSettings} className="bg-emerald-500 hover:bg-emerald-600 w-full"><Save className="h-4 w-4 mr-1.5" /> Salvar configurações</Button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg text-white flex items-center gap-2"><Zap className="h-5 w-5 text-amber-400" /> Regras por palavra-chave</h2>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyRule); setEditId(null); } }}>
              <DialogTrigger asChild><Button data-testid="add-rule-button" size="sm" className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1" /> Regra</Button></DialogTrigger>
              <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
                <DialogHeader><DialogTitle>{editId ? "Editar" : "Nova"} regra</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-slate-300">Nome</Label><Input data-testid="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
                  <div><Label className="text-slate-300">Palavras-chave (vírgula)</Label><Input data-testid="rule-keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="oi, olá, bom dia" className="bg-slate-900 border-slate-700" /></div>
                  <div><Label className="text-slate-300">Resposta automática</Label><Textarea data-testid="rule-response" value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
                  <div className="flex items-center justify-between"><Label className="text-slate-300">Ativa</Label><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /></div>
                </div>
                <DialogFooter><Button data-testid="save-rule-button" onClick={saveRule} className="bg-emerald-500 hover:bg-emerald-600">Salvar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} data-testid={`rule-${r.id}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-100 text-sm">{r.name}</p>
                    {r.enabled ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Ativa</Badge> : <Badge className="bg-slate-600/30 text-slate-400 text-[10px]">Inativa</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => editRule(r)} className="text-slate-500 hover:text-emerald-400 text-xs">Editar</button>
                    <button data-testid={`del-rule-${r.id}`} onClick={() => delRule(r.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">{(r.keywords || []).map((k) => <span key={k} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">{k}</span>)}</div>
                <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{r.response}</p>
              </div>
            ))}
            {rules.length === 0 && <p className="text-center text-slate-500 text-sm py-8">Nenhuma regra criada.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

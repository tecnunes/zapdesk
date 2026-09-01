import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Shield, Headphones } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", email: "", password: "", role: "attendant" };

export default function Agents() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [statuses, setStatuses] = useState([]);
  const [ns, setNs] = useState({ label: "", color: "#10B981" });

  const load = () => api.get("/agents").then((r) => setRows(r.data));
  const loadStatuses = () => api.get("/statuses").then((r) => setStatuses(r.data));
  useEffect(() => { load(); loadStatuses(); }, []);
  const statusColor = (label) => statuses.find((s) => s.label === label)?.color || "#6B7280";
  const addStatus = async () => { if (!ns.label.trim()) return; await api.post("/statuses", ns); toast.success("Status criado"); setNs({ label: "", color: "#10B981" }); loadStatuses(); };
  const delStatus = async (id) => { await api.delete(`/statuses/${id}`); toast.success("Removido"); loadStatuses(); };

  const save = async () => {
    try { await api.post("/agents", form); toast.success("Atendente criado"); setOpen(false); setForm(empty); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };
  const del = async (id) => { try { await api.delete(`/agents/${id}`); toast.success("Removido"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Erro"); } };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Atendentes</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie sua equipe e níveis de acesso</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-agent-button" className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1.5" /> Novo atendente</Button></DialogTrigger>
          <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>Novo atendente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-slate-300">Nome</Label><Input data-testid="agent-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">E-mail</Label><Input data-testid="agent-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Senha</Label><Input data-testid="agent-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Função</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#111827] border-slate-700 text-slate-200">
                    <SelectItem value="attendant">Atendente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button data-testid="save-agent-button" onClick={save} className="bg-emerald-500 hover:bg-emerald-600">Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-slate-800 bg-[#111827] p-5 mb-6">
        <h2 className="font-display font-bold text-lg text-white mb-1">Status de atendimento</h2>
        <p className="text-sm text-slate-400 mb-4">Cadastre os status que os atendentes poderão selecionar na barra lateral.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {statuses.map((s) => (
            <span key={s.id} data-testid={`status-chip-${s.id}`} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 pl-2.5 pr-1.5 py-1 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-slate-200">{s.label}</span>
              <button data-testid={`del-status-${s.id}`} onClick={() => delStatus(s.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          {statuses.length === 0 && <p className="text-sm text-slate-500">Nenhum status cadastrado.</p>}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={ns.color} onChange={(e) => setNs({ ...ns, color: e.target.value })} className="h-9 w-10 rounded bg-slate-900 border border-slate-700 cursor-pointer p-0.5" />
          <Input data-testid="status-label-input" value={ns.label} onChange={(e) => setNs({ ...ns, label: e.target.value })} placeholder="Ex: Disponível, Em almoço…" className="bg-slate-900 border-slate-700 max-w-xs" />
          <Button data-testid="add-status-button" onClick={addStatus} className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => (
          <div key={a.id} data-testid={`agent-card-${a.id}`} className="rounded-xl border border-slate-800 bg-[#111827] p-4">
            <div className="flex items-start gap-3">
              {a.avatar ? <img src={a.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                : <div className="h-12 w-12 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-bold">{a.name?.[0]}</div>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100 truncate">{a.name}</p>
                <p className="text-xs text-slate-500 truncate">{a.email}</p>
              </div>
              {a.role !== "admin" && <button data-testid={`del-agent-${a.id}`} onClick={() => del(a.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="flex items-center justify-between mt-3">
              <Badge className={`${a.role === "admin" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-slate-700/40 text-slate-300 border-slate-600"} gap-1`}>
                {a.role === "admin" ? <Shield className="h-3 w-3" /> : <Headphones className="h-3 w-3" />}
                {a.role === "admin" ? "Admin" : "Atendente"}
              </Badge>
              <span className="flex items-center gap-1.5 text-xs text-slate-300"><span className="h-2 w-2 rounded-full" style={{ background: statusColor(a.status) }} />{a.status || "Sem status"}</span>
            </div>
            <p className="text-xs text-slate-500 mt-3">{a.conversation_count || 0} conversas atribuídas</p>
          </div>
        ))}
      </div>
    </div>
  );
}

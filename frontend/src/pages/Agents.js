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

const STATUS = {
  online: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  busy: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  offline: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};
const empty = { name: "", email: "", password: "", role: "attendant" };

export default function Agents() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => api.get("/agents").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

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
              <Badge className={STATUS[a.status] || STATUS.offline}>{a.status || "offline"}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-3">{a.conversation_count || 0} conversas atribuídas</p>
          </div>
        ))}
      </div>
    </div>
  );
}

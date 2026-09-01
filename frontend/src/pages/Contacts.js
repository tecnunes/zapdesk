import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, Pencil, Contact as ContactIcon } from "lucide-react";
import { toast } from "sonner";

const TAG_STYLES = {
  VIP: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Lead: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  Suporte: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  Inadimplente: "bg-red-500/20 text-red-300 border-red-500/30",
};
const empty = { name: "", phone: "", email: "", tags: [], notes: "" };

export default function Contacts() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => api.get(`/contacts?q=${encodeURIComponent(q)}`).then((r) => setRows(r.data));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  const save = async () => {
    const payload = { ...form, tags: typeof form.tags === "string" ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : form.tags };
    try {
      if (editId) await api.put(`/contacts/${editId}`, payload);
      else await api.post("/contacts", payload);
      toast.success("Contato salvo"); setOpen(false); setForm(empty); setEditId(null); load();
    } catch (e) { toast.error("Erro ao salvar"); }
  };

  const edit = (c) => { setForm({ ...c, tags: (c.tags || []).join(", ") }); setEditId(c.id); setOpen(true); };
  const del = async (id) => { await api.delete(`/contacts/${id}`); toast.success("Contato removido"); load(); };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Contatos</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie sua base de clientes e leads</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditId(null); } }}>
          <DialogTrigger asChild>
            <Button data-testid="add-contact-button" className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1.5" /> Novo contato</Button>
          </DialogTrigger>
          <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} contato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-slate-300">Nome</Label><Input data-testid="contact-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Telefone</Label><Input data-testid="contact-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-slate-900 border-slate-700" placeholder="+55 11 90000-0000" /></div>
              <div><Label className="text-slate-300">E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Tags (vírgula)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="bg-slate-900 border-slate-700" placeholder="VIP, Lead" /></div>
              <div><Label className="text-slate-300">Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
            </div>
            <DialogFooter><Button data-testid="save-contact-button" onClick={save} className="bg-emerald-500 hover:bg-emerald-600">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input data-testid="contact-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou telefone…" className="pl-9 bg-slate-900 border-slate-700 text-slate-100" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
          <div key={c.id} data-testid={`contact-card-${c.id}`} className="rounded-xl border border-slate-800 bg-[#111827] p-4 hover:border-slate-700 transition-colors">
            <div className="flex items-start gap-3">
              {c.avatar ? <img src={c.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                : <div className="h-12 w-12 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-bold">{c.name?.[0]}</div>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100 truncate">{c.name}</p>
                <p className="text-xs text-slate-500 font-mono">{c.phone}</p>
                {c.email && <p className="text-xs text-slate-500 truncate">{c.email}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => edit(c)} className="text-slate-500 hover:text-emerald-400"><Pencil className="h-4 w-4" /></button>
                <button data-testid={`del-contact-${c.id}`} onClick={() => del(c.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {c.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{c.tags.map((t) => <Badge key={t} className={`${TAG_STYLES[t] || "bg-slate-700 text-slate-300"} text-[10px]`}>{t}</Badge>)}</div>}
            {c.notes && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{c.notes}</p>}
          </div>
        ))}
        {rows.length === 0 && <div className="col-span-full text-center text-slate-500 py-16"><ContactIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />Nenhum contato encontrado.</div>}
      </div>
    </div>
  );
}

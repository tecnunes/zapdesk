import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, FileText, Copy } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", category: "Geral", body: "", shortcut: "" };

export default function Templates() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/templates").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editId) await api.put(`/templates/${editId}`, form);
      else await api.post("/templates", form);
      toast.success("Modelo salvo"); setOpen(false); setForm(empty); setEditId(null); load();
    } catch (e) { toast.error("Erro"); }
  };
  const edit = (t) => { setForm(t); setEditId(t.id); setOpen(true); };
  const del = async (id) => { await api.delete(`/templates/${id}`); toast.success("Removido"); load(); };
  const copy = (body) => { navigator.clipboard?.writeText(body); toast.success("Copiado!"); };

  const cats = [...new Set(rows.map((r) => r.category))];

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Respostas Rápidas</h1>
          <p className="text-slate-400 text-sm mt-1">Modelos de mensagem com variáveis {"{{nome}}, {{protocolo}}"}</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditId(null); } }}>
          <DialogTrigger asChild><Button data-testid="add-template-button" className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1.5" /> Novo modelo</Button></DialogTrigger>
          <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} modelo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-slate-300">Título</Label><Input data-testid="template-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-slate-300">Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
                <div><Label className="text-slate-300">Atalho</Label><Input value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} placeholder="/oi" className="bg-slate-900 border-slate-700" /></div>
              </div>
              <div><Label className="text-slate-300">Mensagem</Label><Textarea data-testid="template-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="bg-slate-900 border-slate-700" /></div>
            </div>
            <DialogFooter><Button data-testid="save-template-button" onClick={save} className="bg-emerald-500 hover:bg-emerald-600">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {cats.map((cat) => (
        <div key={cat} className="mb-6">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-medium">{cat}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.filter((r) => r.category === cat).map((t) => (
              <div key={t.id} data-testid={`template-card-${t.id}`} className="rounded-xl border border-slate-800 bg-[#111827] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-100">{t.title}</p>
                  {t.shortcut && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-mono text-[10px]">{t.shortcut}</Badge>}
                </div>
                <p className="text-sm text-slate-400 mt-2 line-clamp-3">{t.body}</p>
                <div className="flex gap-3 mt-3 pt-3 border-t border-slate-800">
                  <button onClick={() => copy(t.body)} className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copiar</button>
                  <button onClick={() => edit(t)} className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                  <button data-testid={`del-template-${t.id}`} onClick={() => del(t.id)} className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 ml-auto"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-center text-slate-500 py-16"><FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />Nenhum modelo.</div>}
    </div>
  );
}

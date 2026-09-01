import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Phone, PhoneIncoming, PhoneOutgoing, Play, Pause, Trash2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

function fmtDur(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function AudioPlayer({ src }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const toggle = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause(); else ref.current.play();
    setPlaying(!playing);
  };
  const cycle = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next); if (ref.current) ref.current.playbackRate = next;
  };
  return (
    <div className="flex items-center gap-2 mt-3 bg-slate-900 rounded-lg p-2">
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} />
      <button data-testid="audio-play-button" onClick={toggle} className="h-8 w-8 grid place-items-center rounded-full bg-emerald-500 text-white">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-emerald-500" /></div>
      <button onClick={cycle} className="text-xs font-mono text-emerald-400 w-8">{rate}x</button>
    </div>
  );
}

const empty = { contact_name: "", contact_phone: "", direction: "inbound", duration: "0", notes: "" };

export default function Calls() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);

  const load = () => api.get("/calls").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append("recording", file);
    try {
      await api.post("/calls", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Ligação registrada"); setOpen(false); setForm(empty); setFile(null); load();
    } catch (e) { toast.error("Erro"); }
  };
  const del = async (id) => { await api.delete(`/calls/${id}`); toast.success("Removido"); load(); };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Ligações</h1>
          <p className="text-slate-400 text-sm mt-1">Histórico de chamadas e gravações de áudio</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="add-call-button" className="bg-emerald-500 hover:bg-emerald-600"><Plus className="h-4 w-4 mr-1.5" /> Registrar ligação</Button></DialogTrigger>
          <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>Registrar ligação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-slate-300">Contato</Label><Input data-testid="call-name" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div><Label className="text-slate-300">Telefone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-slate-300">Tipo</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#111827] border-slate-700 text-slate-200">
                      <SelectItem value="inbound">Recebida</SelectItem>
                      <SelectItem value="outbound">Realizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-slate-300">Duração (s)</Label><Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              </div>
              <div><Label className="text-slate-300">Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-slate-900 border-slate-700" /></div>
              <div>
                <Label className="text-slate-300">Gravação (áudio)</Label>
                <label className="mt-1.5 flex items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900 px-3 py-2.5 cursor-pointer hover:border-emerald-500/50">
                  <Upload className="h-4 w-4 text-slate-500" />
                  <span className="text-sm text-slate-400">{file ? file.name : "Selecionar arquivo de áudio"}</span>
                  <input data-testid="call-recording" type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
                </label>
              </div>
            </div>
            <DialogFooter><Button data-testid="save-call-button" onClick={save} className="bg-emerald-500 hover:bg-emerald-600">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.id} data-testid={`call-${c.id}`} className="rounded-xl border border-slate-800 bg-[#111827] p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full grid place-items-center ${c.direction === "inbound" ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"}`}>
                {c.direction === "inbound" ? <PhoneIncoming className="h-5 w-5" /> : <PhoneOutgoing className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100">{c.contact_name}</p>
                <p className="text-xs text-slate-500 font-mono">{c.contact_phone}</p>
              </div>
              <div className="text-right">
                <Badge className={c.direction === "inbound" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"}>
                  {c.direction === "inbound" ? "Recebida" : "Realizada"}
                </Badge>
                <p className="text-xs text-slate-500 mt-1">{fmtDur(c.duration || 0)} · {c.agent_name}</p>
              </div>
              <button data-testid={`del-call-${c.id}`} onClick={() => del(c.id)} className="text-slate-500 hover:text-red-400 ml-2"><Trash2 className="h-4 w-4" /></button>
            </div>
            {c.notes && <p className="text-sm text-slate-400 mt-2">{c.notes}</p>}
            {c.recording && <AudioPlayer src={c.recording} />}
          </div>
        ))}
        {rows.length === 0 && <div className="text-center text-slate-500 py-16"><Phone className="h-10 w-10 mx-auto mb-2 opacity-40" />Nenhuma ligação registrada.</div>}
      </div>
    </div>
  );
}

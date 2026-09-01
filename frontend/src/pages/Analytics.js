import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { MessagesSquare, Users, Contact, Phone, Clock, Star, Trophy } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, accent }) => (
  <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
    <div className="flex items-center justify-between">
      <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</p>
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${accent}`}><Icon className="h-4.5 w-4.5" /></div>
    </div>
    <p className="font-display text-3xl font-extrabold text-white mt-3">{value}</p>
  </div>
);

export default function Analytics() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/dashboard/stats").then((r) => setStats(r.data)); }, []);
  if (!stats) return <div className="p-8 text-slate-400">Carregando…</div>;

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-white">Análises</h1>
        <p className="text-slate-400 text-sm mt-1">Visão geral do desempenho do atendimento</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard icon={MessagesSquare} label="Conversas" value={stats.total_conversations} accent="bg-emerald-500/15 text-emerald-400" />
        <StatCard icon={Clock} label="Em aberto" value={stats.open_conversations} accent="bg-amber-500/15 text-amber-400" />
        <StatCard icon={Contact} label="Contatos" value={stats.total_contacts} accent="bg-indigo-500/15 text-indigo-400" />
        <StatCard icon={Users} label="Atendentes" value={stats.total_agents} accent="bg-sky-500/15 text-sky-400" />
        <StatCard icon={MessagesSquare} label="Mensagens" value={stats.total_messages} accent="bg-emerald-500/15 text-emerald-400" />
        <StatCard icon={Phone} label="Ligações" value={stats.total_calls} accent="bg-indigo-500/15 text-indigo-400" />
        <StatCard icon={Clock} label="Tempo médio resp." value={`${stats.avg_response_min}min`} accent="bg-amber-500/15 text-amber-400" />
        <StatCard icon={Star} label="CSAT" value={stats.csat} accent="bg-emerald-500/15 text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#111827] p-6">
          <h2 className="font-display font-bold text-lg text-white mb-4">Mensagens por dia (7 dias)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.messages_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
              <XAxis dataKey="day" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0d1220", border: "1px solid #374151", borderRadius: 8, color: "#fff" }} cursor={{ fill: "rgba(16,185,129,0.08)" }} />
              <Bar dataKey="messages" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6">
          <h2 className="font-display font-bold text-lg text-white mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Ranking de atendentes</h2>
          <div className="space-y-3">
            {stats.leaderboard.map((a, i) => (
              <div key={a.name} className="flex items-center gap-3">
                <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-sm text-slate-200 truncate">{a.name}</p></div>
                <span className="text-sm font-semibold text-emerald-400">{a.conversations}</span>
              </div>
            ))}
            {stats.leaderboard.length === 0 && <p className="text-sm text-slate-500">Sem dados.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

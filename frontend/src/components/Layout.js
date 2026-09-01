import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessagesSquare, Users, LayoutDashboard, Bot, FileText,
  Phone, Contact, PlugZap, LogOut, MessageCircleHeart,
} from "lucide-react";

const nav = [
  { to: "/", label: "Caixa de Entrada", icon: MessagesSquare, testid: "nav-inbox", end: true },
  { to: "/contacts", label: "Contatos", icon: Contact, testid: "nav-contacts" },
  { to: "/templates", label: "Respostas Rápidas", icon: FileText, testid: "nav-templates" },
  { to: "/calls", label: "Ligações", icon: Phone, testid: "nav-calls" },
  { to: "/chatbot", label: "Chatbot & IA", icon: Bot, testid: "nav-chatbot", admin: true },
  { to: "/agents", label: "Atendentes", icon: Users, testid: "nav-agents", admin: true },
  { to: "/analytics", label: "Análises", icon: LayoutDashboard, testid: "nav-analytics", admin: true },
  { to: "/connection", label: "Conexão WhatsApp", icon: PlugZap, testid: "nav-connection", admin: true },
];

export default function Layout() {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [statuses, setStatuses] = useState([]);

  useEffect(() => { api.get("/statuses").then((r) => setStatuses(r.data)).catch(() => {}); }, []);

  const handleLogout = async () => { await logout(); navigate("/login"); };
  const statusColor = (label) => statuses.find((s) => s.label === label)?.color || "#6B7280";
  const changeStatus = async (label) => {
    try { await api.put("/me/status", { status: label }); setUser({ ...user, status: label }); toast.success("Status atualizado"); }
    catch (e) { toast.error("Erro ao atualizar status"); }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0B0F17] text-slate-200">
      {/* Sidebar */}
      <aside className="hidden md:flex w-[240px] flex-col border-r border-slate-800 bg-[#0d1220]">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-emerald-500 text-white">
            <MessageCircleHeart className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display font-extrabold text-lg leading-none text-white">ZapDesk</p>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 mt-0.5">Atendimento</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.filter((n) => !n.admin || isAdmin).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300 shadow-[inset_2px_0_0_0_#10B981]"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`
              }
            >
              <n.icon className="h-[18px] w-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3 space-y-2">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="grid place-items-center h-9 w-9 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user?.role === "admin" ? "Administrador" : "Atendente"}</p>
            </div>
            <button data-testid="logout-button" onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
          <Select value={user?.status || ""} onValueChange={changeStatus}>
            <SelectTrigger data-testid="my-status-select" className="bg-slate-900 border-slate-700 text-slate-200 h-9 text-xs">
              <span className="flex items-center gap-2 truncate">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: statusColor(user?.status) }} />
                <SelectValue placeholder="Definir status" />
              </span>
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-slate-700 text-slate-200">
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.label}>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="md:hidden flex items-center gap-2 overflow-x-auto border-b border-slate-800 bg-[#0d1220] px-2 py-2">
          {nav.filter((n) => !n.admin || isAdmin).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`m-${n.testid}`}
              className={({ isActive }) => `shrink-0 rounded-lg p-2 ${isActive ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400"}`}>
              <n.icon className="h-5 w-5" />
            </NavLink>
          ))}
          <button onClick={handleLogout} className="shrink-0 rounded-lg p-2 text-slate-400"><LogOut className="h-5 w-5" /></button>
        </div>
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

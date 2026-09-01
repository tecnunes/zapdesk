import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Search, Send, Sparkles, Bot, BotOff, CheckCheck, Zap, User, UserPlus,
  MessageSquarePlus, Loader2, Phone, Tag, X,
} from "lucide-react";
import { toast } from "sonner";

const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "mine", label: "Minhas" },
  { key: "unassigned", label: "Não atribuídas" },
];

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Inbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [agents, setAgents] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newSearch, setNewSearch] = useState("");
  const [manual, setManual] = useState({ name: "", phone: "" });
  const scrollRef = useRef(null);

  const loadConvs = useCallback(async () => {
    const { data } = await api.get(`/conversations?filter=${filter}`);
    setConversations(data);
    if (!activeId && data.length) setActiveId(data[0].id);
  }, [filter, activeId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    const { data } = await api.get(`/conversations/${id}`);
    setDetail(data);
  }, []);

  useEffect(() => { loadConvs(); }, [filter]);
  useEffect(() => { if (activeId) loadDetail(activeId); }, [activeId, loadDetail]);
  useEffect(() => {
    api.get("/templates").then((r) => setTemplates(r.data));
    api.get("/agents").then((r) => setAgents(r.data.filter((a) => a.role === "attendant" || a.role === "admin")));
    api.get("/contacts").then((r) => setContacts(r.data));
  }, []);

  const startConversation = async (c) => {
    try {
      const payload = c.id ? { contact_id: c.id } : { name: c.name, phone: c.phone };
      const { data } = await api.post("/conversations", payload);
      setNewOpen(false); setManual({ name: "", phone: "" }); setNewSearch("");
      await loadConvs();
      setActiveId(data.id);
      toast.success("Conversa iniciada");
    } catch (e) { toast.error(e.response?.data?.detail || "Erro ao iniciar conversa"); }
  };

  // polling
  useEffect(() => {
    const t = setInterval(() => { loadConvs(); if (activeId) loadDetail(activeId); }, 5000);
    return () => clearInterval(t);
  }, [activeId, filter, loadConvs, loadDetail]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail?.messages?.length]);

  const send = async () => {
    if (!text.trim() || !activeId) return;
    setSending(true);
    try {
      await api.post(`/conversations/${activeId}/messages`, { body: text });
      setText("");
      await loadDetail(activeId); loadConvs();
    } catch (e) { toast.error("Falha ao enviar"); }
    finally { setSending(false); }
  };

  const simulateIncoming = async () => {
    if (!activeId) return;
    const samples = ["Olá, preciso de ajuda", "Qual o horário de atendimento?", "Boa tarde", "2", "Quero falar com um atendente"];
    const body = samples[Math.floor(Math.random() * samples.length)];
    await api.post("/simulate/incoming", { conversation_id: activeId, body });
    toast.info(`Cliente enviou: "${body}"`);
    setTimeout(() => { loadDetail(activeId); loadConvs(); }, 1200);
  };

  const aiSuggest = async () => {
    if (!activeId) return;
    setAiLoading(true);
    try {
      const { data } = await api.post(`/conversations/${activeId}/ai-suggest`);
      setText(data.suggestion);
      toast.success("Sugestão de IA gerada");
    } catch (e) { toast.error("IA indisponível no momento"); }
    finally { setAiLoading(false); }
  };

  const toggleBot = async () => {
    const { data } = await api.post(`/conversations/${activeId}/toggle-bot`);
    toast.info(data.bot_active ? "Bot ativado nesta conversa" : "Bot pausado");
    loadDetail(activeId);
  };

  const assign = async (agentId) => {
    await api.post(`/conversations/${activeId}/assign`, { agent_id: agentId === "none" ? null : agentId });
    loadDetail(activeId); loadConvs();
    toast.success("Atribuição atualizada");
  };

  const applyTemplate = (body) => {
    const name = detail?.conversation?.contact_name?.split(" ")[0] || "";
    setText(body.replace(/{{nome}}/g, name).replace(/{{protocolo}}/g, "#" + Math.floor(100000 + Math.random() * 899999)));
  };

  const filtered = conversations.filter((c) =>
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_phone?.includes(search));

  const conv = detail?.conversation;

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-full sm:w-[320px] shrink-0 border-r border-slate-800 flex flex-col bg-[#0d1220]">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display text-xl font-bold text-white">Conversas</h1>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button data-testid="new-conversation-button" size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-8">
                  <UserPlus className="h-4 w-4 mr-1" /> Nova
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
                <DialogHeader><DialogTitle>Iniciar nova conversa</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input data-testid="new-conv-search" value={newSearch} onChange={(e) => setNewSearch(e.target.value)}
                      placeholder="Buscar contato…" className="pl-9 bg-slate-900 border-slate-700" />
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {contacts.filter((c) => c.name.toLowerCase().includes(newSearch.toLowerCase()) || c.phone.includes(newSearch)).map((c) => (
                      <button key={c.id} data-testid={`start-conv-${c.id}`} onClick={() => startConversation(c)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 text-left">
                        {c.avatar ? <img src={c.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                          : <div className="h-9 w-9 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-semibold text-sm">{c.name?.[0]}</div>}
                        <div className="min-w-0"><p className="text-sm font-medium text-slate-100 truncate">{c.name}</p><p className="text-xs text-slate-500 font-mono">{c.phone}</p></div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 pt-3">
                    <p className="text-xs text-slate-500 mb-2">Ou inicie com um novo número</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Nome" className="bg-slate-900 border-slate-700" />
                      <Input data-testid="manual-phone" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} placeholder="+55 11 90000-0000" className="bg-slate-900 border-slate-700" />
                    </div>
                    <Button data-testid="start-manual-conv" onClick={() => startConversation(manual)} disabled={!manual.phone.trim()} className="w-full mt-2 bg-emerald-500 hover:bg-emerald-600">Iniciar conversa</Button>
                    <p className="text-[11px] text-slate-500 mt-2">No WhatsApp oficial, iniciar com o cliente exige janela de 24h ou modelo aprovado.</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input data-testid="chat-search-input" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato…" className="pl-9 bg-slate-900 border-slate-700 text-slate-100 h-9" />
          </div>
          <div className="flex gap-1 mt-3">
            {FILTERS.map((f) => (
              <button key={f.key} data-testid={`filter-${f.key}`} onClick={() => setFilter(f.key)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                  filter === f.key ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-slate-800"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="text-center text-slate-500 text-sm p-8">Nenhuma conversa.</p>}
          {filtered.map((c) => (
            <button key={c.id} data-testid={`conv-item-${c.id}`} onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-800/60 flex gap-3 transition-colors ${
                activeId === c.id ? "bg-emerald-500/10" : "hover:bg-slate-800/40"}`}>
              <div className="relative shrink-0">
                {c.avatar ? <img src={c.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                  : <div className="h-11 w-11 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-semibold">{c.contact_name?.[0]}</div>}
                {c.bot_active && <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-indigo-500 grid place-items-center border-2 border-[#0d1220]"><Bot className="h-2 w-2 text-white" /></span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <p className="font-semibold text-sm text-slate-100 truncate">{c.contact_name}</p>
                  <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="flex justify-between items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400 truncate">{c.last_message}</p>
                  {c.unread > 0 && <span className="shrink-0 h-5 min-w-5 px-1.5 grid place-items-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">{c.unread}</span>}
                </div>
                <div className="flex gap-1 mt-1">
                  {c.agent_name ? <span className="text-[10px] text-slate-500 flex items-center gap-1"><User className="h-2.5 w-2.5" />{c.agent_name}</span>
                    : <span className="text-[10px] text-amber-400/80">Não atribuída</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat thread */}
      <div className="hidden sm:flex flex-1 flex-col chat-bg min-w-0">
        {!conv ? (
          <div className="flex-1 grid place-items-center text-slate-500">
            <div className="text-center"><MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>Selecione uma conversa</p></div>
          </div>
        ) : (
          <>
            <div className="h-16 shrink-0 border-b border-slate-800 bg-[#0d1220]/80 backdrop-blur flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                {conv.avatar ? <img src={conv.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                  : <div className="h-9 w-9 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-semibold text-sm">{conv.contact_name?.[0]}</div>}
                <div>
                  <p className="font-semibold text-sm text-slate-100">{conv.contact_name}</p>
                  <p className="text-[11px] text-slate-500 font-mono">{conv.contact_phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button data-testid="toggle-bot-button" onClick={toggleBot} variant="outline" size="sm"
                  className={`border-slate-700 ${conv.bot_active ? "text-indigo-300 bg-indigo-500/10" : "text-slate-400 bg-slate-800/50"}`}>
                  {conv.bot_active ? <Bot className="h-4 w-4 mr-1.5" /> : <BotOff className="h-4 w-4 mr-1.5" />}
                  {conv.bot_active ? "Bot ativo" : "Bot pausado"}
                </Button>
                <Button data-testid="simulate-incoming-button" onClick={simulateIncoming} variant="outline" size="sm" className="border-slate-700 text-slate-300 bg-slate-800/50">
                  <MessageSquarePlus className="h-4 w-4 mr-1.5" /> Simular cliente
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
              {detail?.messages?.map((m) => {
                const out = m.direction === "out";
                const isBot = m.sender?.includes("Bot") || m.sender?.includes("IA");
                return (
                  <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"} bubble-in`}>
                    <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 ${out
                      ? (isBot ? "bg-indigo-950/70 border border-indigo-500/30 rounded-br-sm" : "bg-emerald-900/60 border border-emerald-500/20 rounded-br-sm")
                      : "bg-slate-800 rounded-bl-sm"}`}>
                      {out && isBot && <p className="text-[10px] text-indigo-300 font-semibold mb-0.5 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />{m.sender}</p>}
                      <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{m.body}</p>
                      <div className={`flex items-center gap-1 mt-1 ${out ? "justify-end" : ""}`}>
                        <span className="text-[10px] text-slate-500">{timeAgo(m.created_at)}</span>
                        {out && <CheckCheck className="h-3 w-3 text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 border-t border-slate-800 bg-[#0d1220] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button data-testid="quick-reply-trigger" variant="outline" size="sm" className="border-slate-700 text-slate-300 bg-slate-800/50">
                      <Zap className="h-4 w-4 mr-1.5 text-amber-400" /> Respostas rápidas
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 bg-[#111827] border-slate-700 p-2" align="start">
                    <p className="text-xs text-slate-400 px-2 py-1">Modelos</p>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {templates.map((t) => (
                        <button key={t.id} data-testid={`tpl-${t.id}`} onClick={() => applyTemplate(t.body)}
                          className="w-full text-left p-2 rounded-md hover:bg-slate-800">
                          <p className="text-sm text-slate-200 font-medium">{t.title} <span className="text-[10px] text-emerald-400 font-mono">{t.shortcut}</span></p>
                          <p className="text-xs text-slate-500 truncate">{t.body}</p>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button data-testid="ai-suggest-button" onClick={aiSuggest} disabled={aiLoading} variant="outline" size="sm" className="border-indigo-500/40 text-indigo-300 bg-indigo-500/10">
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />} Sugerir com IA
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Textarea data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Digite uma mensagem…" rows={1}
                  className="resize-none bg-slate-900 border-slate-700 text-slate-100 min-h-[42px] max-h-32" />
                <Button data-testid="send-message-button" onClick={send} disabled={sending || !text.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 h-[42px] px-4">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CRM panel */}
      {conv && (
        <div className="hidden xl:flex w-[300px] shrink-0 border-l border-slate-800 flex-col bg-[#0d1220] overflow-y-auto">
          <div className="p-6 text-center border-b border-slate-800">
            {conv.avatar ? <img src={conv.avatar} alt="" className="h-20 w-20 rounded-full object-cover mx-auto mb-3" />
              : <div className="h-20 w-20 rounded-full grid place-items-center bg-indigo-500/20 text-indigo-300 font-bold text-2xl mx-auto mb-3">{conv.contact_name?.[0]}</div>}
            <p className="font-display font-bold text-lg text-white">{conv.contact_name}</p>
            <p className="text-sm text-slate-500 font-mono">{conv.contact_phone}</p>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-medium">Atendente responsável</p>
              <Select value={conv.agent_id || "none"} onValueChange={assign}>
                <SelectTrigger data-testid="assign-agent-select" className="bg-slate-900 border-slate-700 text-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#111827] border-slate-700 text-slate-200">
                  <SelectItem value="none">Não atribuída</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-medium">Status</p>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 capitalize">{conv.status}</Badge>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-medium">Canal</p>
              <div className="flex items-center gap-2 text-sm text-slate-300"><Phone className="h-4 w-4 text-emerald-400" /> WhatsApp</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Inbox from "@/pages/Inbox";
import Contacts from "@/pages/Contacts";
import Agents from "@/pages/Agents";
import Chatbot from "@/pages/Chatbot";
import Templates from "@/pages/Templates";
import Calls from "@/pages/Calls";
import Analytics from "@/pages/Analytics";
import Connection from "@/pages/Connection";

function Protected({ children, adminOnly }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-slate-400">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" theme="dark" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Inbox />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="templates" element={<Templates />} />
            <Route path="calls" element={<Calls />} />
            <Route path="agents" element={<Protected adminOnly><Agents /></Protected>} />
            <Route path="chatbot" element={<Protected adminOnly><Chatbot /></Protected>} />
            <Route path="analytics" element={<Protected adminOnly><Analytics /></Protected>} />
            <Route path="connection" element={<Protected adminOnly><Connection /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

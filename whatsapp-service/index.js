const express = require("express");
const qrcode = require("qrcode");
const pino = require("pino");
const axios = require("axios");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3001;
const SECRET = process.env.QR_BRIDGE_SECRET || "zapdesk-qr-bridge-2026";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8001";
const AUTH_DIR = process.env.AUTH_DIR || "/app/whatsapp-service/auth";

let sock = null;
let currentQR = null;
let status = "disconnected"; // connecting | qr | connected | disconnected
let meNumber = null;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version = [2, 3000, 0];
  try { ({ version } = await fetchLatestBaileysVersion()); } catch (e) {}
  status = "connecting";
  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["ZapDesk", "Chrome", "1.0.0"],
    syncFullHistory: true,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messaging-history.set", async ({ chats, messages }) => {
    try {
      const map = {};
      for (const c of chats || []) {
        const jid = c.id || "";
        if (!jid.endsWith("@s.whatsapp.net")) continue;
        const phone = jid.split("@")[0];
        map[phone] = { phone, name: c.name || c.notify || phone, messages: [] };
      }
      for (const m of messages || []) {
        const jid = m.key?.remoteJid || "";
        if (!jid.endsWith("@s.whatsapp.net")) continue;
        const phone = jid.split("@")[0];
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
        if (!text) continue;
        if (!map[phone]) map[phone] = { phone, name: m.pushName || phone, messages: [] };
        const ts = new Date((Number(m.messageTimestamp) || 0) * 1000).toISOString();
        map[phone].messages.push({ fromMe: !!m.key.fromMe, text, ts });
      }
      const arr = Object.values(map);
      for (const c of arr) {
        c.messages.sort((a, b) => (a.ts < b.ts ? -1 : 1));
        c.last_message = c.messages.length ? c.messages[c.messages.length - 1].text : "";
      }
      for (let i = 0; i < arr.length; i += 40) {
        await axios
          .post(`${BACKEND_URL}/api/whatsapp/qr/sync`, { chats: arr.slice(i, i + 40) }, { headers: { "x-bridge-secret": SECRET } })
          .catch((e) => console.log("sync err", e.message));
      }
      console.log("history sync enviado, chats=", arr.length);
    } catch (e) { console.log("history err", e.message); }
  });

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      try { currentQR = await qrcode.toDataURL(qr); status = "qr"; } catch (e) {}
    }
    if (connection === "open") {
      status = "connected"; currentQR = null; meNumber = sock.user?.id || null;
      console.log("WhatsApp conectado:", meNumber);
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      status = "disconnected";
      console.log("Conexão fechada. code=", code);
      if (code !== DisconnectReason.loggedOut) setTimeout(startSock, 4000);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    try {
      for (const msg of m.messages || []) {
        if (msg.key.fromMe || !msg.message) continue;
        const jid = msg.key.remoteJid || "";
        if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;
        const from = jid.split("@")[0];
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!text) continue;
        const name = msg.pushName || from;
        await axios
          .post(`${BACKEND_URL}/api/whatsapp/qr/incoming`, { from, text, name }, { headers: { "x-bridge-secret": SECRET } })
          .catch((e) => console.log("forward err", e.message));
      }
    } catch (e) { console.log("upsert err", e.message); }
  });
}

const app = express();
app.use(express.json());
function auth(req, res, next) {
  if (req.headers["x-bridge-secret"] !== SECRET) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.get("/status", auth, (req, res) => res.json({ status, qr: currentQR, me: meNumber }));

app.post("/send", auth, async (req, res) => {
  try {
    if (status !== "connected") return res.status(409).json({ error: "not_connected" });
    const { to, text } = req.body;
    const jid = String(to).replace(/\D/g, "") + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/logout", auth, async (req, res) => {
  try { if (sock) await sock.logout().catch(() => {}); } catch (e) {}
  try { require("fs").rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
  currentQR = null; meNumber = null; status = "disconnected";
  setTimeout(startSock, 1500);
  res.json({ ok: true });
});

app.get("/health", (req, res) => res.json({ ok: true, status }));

app.listen(PORT, () => console.log("ZapDesk WhatsApp QR bridge na porta " + PORT));
startSock();

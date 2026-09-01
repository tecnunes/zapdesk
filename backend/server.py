from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import hmac
import hashlib
import secrets
import base64
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import jwt
import bcrypt
import httpx
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, EmailStr

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("zapdesk")

app = FastAPI(title="ZapDesk API")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "ZapDesk"
GRAPH_API_VERSION = "v23.0"
QR_URL = os.environ.get("WHATSAPP_QR_URL", "http://localhost:3001")
QR_SECRET = os.environ.get("QR_BRIDGE_SECRET", "zapdesk-qr-bridge-2026")

# ---------------- Helpers: Mongo model ----------------
PyObjectId = Annotated[str, BeforeValidator(str)]

def now_utc():
    return datetime.now(timezone.utc)

def iso(dt=None):
    return (dt or now_utc()).isoformat()

def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc

# ---------------- Auth utils ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str, role: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "role": role, "ver": token_version,
               "exp": now_utc() + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version, "exp": now_utc() + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ---------------- Email (password reset) ----------------
async def send_password_reset_email(to_email: str, token: str) -> bool:
    from html import escape
    from urllib.parse import urlparse
    base = FRONTEND_URL.rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; reset link: %s", link)
        else:
            logger.error("Reset email not configured")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
            f'<p>Recebemos uma solicitação para redefinir sua senha do {brand}.</p>'
            f'<p><a href="{escape(link)}">Redefinir minha senha</a></p>'
            f'<p>Este link expira em 1 hora e pode ser usado uma vez.</p></td></tr></table>')
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                             headers={"X-Email-Key": EMAIL_KEY},
                             json={"to": [to_email], "subject": f"Redefinir senha {EMAIL_FROM_NAME}",
                                   "html": html, "from_name": EMAIL_FROM_NAME})
        r.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Reset email failed: {e}")
        return False

# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    password: str

class AgentIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "attendant"

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    role: Optional[str] = None

class ContactIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    tags: List[str] = []
    notes: Optional[str] = ""

class MessageIn(BaseModel):
    body: str
    type: str = "text"

class SimulateIn(BaseModel):
    conversation_id: str
    body: str

class TemplateIn(BaseModel):
    title: str
    category: str = "Geral"
    body: str
    shortcut: Optional[str] = ""

class AutomationIn(BaseModel):
    name: str
    keywords: List[str] = []
    response: str
    enabled: bool = True

class BotSettingsIn(BaseModel):
    bot_enabled: bool = True
    ai_enabled: bool = True
    welcome_message: str = ""
    away_message: str = ""
    ai_system_prompt: str = ""

class WhatsAppSettingsIn(BaseModel):
    provider: str = "meta"
    phone_number_id: str = ""
    access_token: str = ""
    verify_token: str = ""
    business_phone: str = ""
    display_name: str = ""

class AssignIn(BaseModel):
    agent_id: Optional[str] = None

class StatusIn(BaseModel):
    status: str

class StatusDefIn(BaseModel):
    label: str
    color: str = "#10B981"

class MyStatusIn(BaseModel):
    status: str

# ================= AUTH =================
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name,
           "role": "attendant", "status": "online", "token_version": 0, "created_at": iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    at = create_access_token(uid, email, "attendant")
    rt = create_refresh_token(uid)
    _set_cookies(response, at, rt)
    return {"access_token": at, "user": clean({**doc, "_id": res.inserted_id})}

def _set_cookies(response: Response, at: str, rt: str):
    response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", rt, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ip = request.client.host if request.client else "?"
    identifier = f"{ip}:{email}"
    att = await db.login_attempts.find_one({"identifier": identifier})
    if att and att.get("count", 0) >= 5 and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > now_utc():
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente em 15 minutos.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"email": email, "locked_until": iso(now_utc() + timedelta(minutes=15))}}, upsert=True)
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    await db.login_attempts.delete_many({"identifier": identifier})
    uid = str(user["_id"])
    at = create_access_token(uid, email, user.get("role", "attendant"), user.get("token_version", 0))
    rt = create_refresh_token(uid, user.get("token_version", 0))
    _set_cookies(response, at, rt)
    return {"access_token": at, "user": clean(user)}

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean(user)

@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user or payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        at = create_access_token(str(user["_id"]), user["email"], user.get("role", "attendant"), user.get("token_version", 0))
        response.set_cookie("access_token", at, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
        return {"access_token": at}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn, background_tasks: BackgroundTasks):
    email = body.email.lower()
    generic = {"message": "Se o e-mail estiver cadastrado, um link de redefinição foi enviado."}
    await db.password_reset_requests.insert_one({"email": email, "created_at": iso()})
    since = now_utc() - timedelta(minutes=15)
    count = await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gt": since.isoformat()}})
    if count > 5:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    th = hashlib.sha256(token.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({"token_hash": th, "user_id": str(user["_id"]), "email": user["email"],
                                               "expires_at": iso(now_utc() + timedelta(hours=1)), "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return generic

@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    th = hashlib.sha256(body.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": th, "used": False, "expires_at": {"$gt": iso()}}, {"$set": {"used": True}})
    if not doc:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado")
    await db.users.update_one({"_id": ObjectId(doc["user_id"])},
                              {"$set": {"password_hash": hash_password(body.password)}, "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Senha redefinida com sucesso"}

# ================= AGENTS =================
@api.get("/agents")
async def list_agents(user: dict = Depends(get_current_user)):
    agents = await db.users.find().sort("created_at", 1).to_list(500)
    out = []
    for a in agents:
        c = clean(a)
        c["conversation_count"] = await db.conversations.count_documents({"agent_id": str(a["_id"])})
        out.append(c)
    return out

@api.post("/agents")
async def create_agent(body: AgentIn, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name,
           "role": body.role if body.role in ("admin", "attendant") else "attendant",
           "status": "offline", "token_version": 0, "created_at": iso()}
    res = await db.users.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.put("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    if ("role" in upd or "name" in upd) and user.get("role") != "admin" and str(user["_id"]) != agent_id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    await db.users.update_one({"_id": ObjectId(agent_id)}, {"$set": upd})
    return clean(await db.users.find_one({"_id": ObjectId(agent_id)}))

@api.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, admin: dict = Depends(require_admin)):
    if str(admin["_id"]) == agent_id:
        raise HTTPException(status_code=400, detail="Não pode remover a si mesmo")
    await db.users.delete_one({"_id": ObjectId(agent_id)})
    await db.conversations.update_many({"agent_id": agent_id}, {"$set": {"agent_id": None}})
    return {"ok": True}

# ================= STATUSES (atendimento) =================
@api.get("/statuses")
async def list_statuses(user: dict = Depends(get_current_user)):
    rows = await db.statuses.find().sort("created_at", 1).to_list(100)
    return [clean(r) for r in rows]

@api.post("/statuses")
async def create_status(body: StatusDefIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump(); doc["created_at"] = iso()
    res = await db.statuses.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.put("/statuses/{sid}")
async def update_status(sid: str, body: StatusDefIn, admin: dict = Depends(require_admin)):
    await db.statuses.update_one({"_id": ObjectId(sid)}, {"$set": body.model_dump()})
    return clean(await db.statuses.find_one({"_id": ObjectId(sid)}))

@api.delete("/statuses/{sid}")
async def delete_status(sid: str, admin: dict = Depends(require_admin)):
    await db.statuses.delete_one({"_id": ObjectId(sid)})
    return {"ok": True}

@api.put("/me/status")
async def set_my_status(body: MyStatusIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"status": body.status}})
    return {"status": body.status}

# ================= CONTACTS =================
@api.get("/contacts")
async def list_contacts(user: dict = Depends(get_current_user), q: str = ""):
    query = {}
    if q:
        query = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q, "$options": "i"}}]}
    rows = await db.contacts.find(query).sort("name", 1).to_list(1000)
    return [clean(r) for r in rows]

@api.post("/contacts")
async def create_contact(body: ContactIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["created_at"] = iso()
    doc["avatar"] = ""
    res = await db.contacts.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, body: ContactIn, user: dict = Depends(get_current_user)):
    await db.contacts.update_one({"_id": ObjectId(contact_id)}, {"$set": body.model_dump()})
    return clean(await db.contacts.find_one({"_id": ObjectId(contact_id)}))

@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    await db.contacts.delete_one({"_id": ObjectId(contact_id)})
    return {"ok": True}

# ================= CONVERSATIONS & MESSAGES =================
@api.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user), filter: str = "all"):
    query = {}
    if filter == "mine":
        query = {"agent_id": str(user["_id"])}
    elif filter == "unassigned":
        query = {"agent_id": None}
    rows = await db.conversations.find(query).sort("last_message_at", -1).to_list(500)
    out = []
    for r in rows:
        c = clean(r)
        c["unread"] = r.get("unread", 0)
        out.append(c)
    return out

class StartConvIn(BaseModel):
    contact_id: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None

@api.post("/conversations")
async def start_conversation(body: StartConvIn, user: dict = Depends(get_current_user)):
    name, phone, avatar = body.name, body.phone, ""
    if body.contact_id:
        c = await db.contacts.find_one({"_id": ObjectId(body.contact_id)})
        if not c:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        name, phone, avatar = c["name"], c["phone"], c.get("avatar", "")
    if not phone or not phone.strip():
        raise HTTPException(status_code=400, detail="Telefone é obrigatório")
    phone = phone.strip()
    existing = await db.conversations.find_one({"contact_phone": phone})
    if existing:
        return clean(existing)
    if not body.contact_id and not await db.contacts.find_one({"phone": phone}):
        await db.contacts.insert_one({"name": name or phone, "phone": phone, "email": "",
                                      "tags": [], "notes": "", "avatar": "", "created_at": iso()})
    doc = {"contact_name": name or phone, "contact_phone": phone, "channel": "whatsapp",
           "agent_id": str(user["_id"]), "agent_name": user["name"], "status": "open",
           "bot_active": False, "unread": 0, "avatar": avatar,
           "last_message": "", "last_message_at": iso(), "created_at": iso()}
    res = await db.conversations.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {"unread": 0}})
    conv["unread"] = 0
    msgs = await db.messages.find({"conversation_id": conv_id}).sort("created_at", 1).to_list(1000)
    return {"conversation": clean(conv), "messages": [clean(m) for m in msgs]}

@api.post("/conversations/{conv_id}/assign")
async def assign_conversation(conv_id: str, body: AssignIn, user: dict = Depends(get_current_user)):
    agent_name = None
    if body.agent_id:
        a = await db.users.find_one({"_id": ObjectId(body.agent_id)})
        agent_name = a["name"] if a else None
    await db.conversations.update_one({"_id": ObjectId(conv_id)},
                                      {"$set": {"agent_id": body.agent_id, "agent_name": agent_name}})
    return clean(await db.conversations.find_one({"_id": ObjectId(conv_id)}))

@api.post("/conversations/{conv_id}/status")
async def set_conversation_status(conv_id: str, body: StatusIn, user: dict = Depends(get_current_user)):
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {"status": body.status}})
    return clean(await db.conversations.find_one({"_id": ObjectId(conv_id)}))

@api.post("/conversations/{conv_id}/toggle-bot")
async def toggle_bot(conv_id: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
    new = not conv.get("bot_active", True)
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {"bot_active": new}})
    return {"bot_active": new}

async def _insert_message(conv_id: str, direction: str, body: str, sender: str, mtype: str = "text"):
    doc = {"conversation_id": conv_id, "direction": direction, "body": body, "type": mtype,
           "sender": sender, "status": "sent", "created_at": iso()}
    await db.messages.insert_one(doc)
    upd = {"last_message": body[:80], "last_message_at": iso()}
    if direction == "in":
        await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": upd, "$inc": {"unread": 1}})
    else:
        await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": upd})
    return doc

async def send_whatsapp_text(to: str, body: str):
    s = await db.settings.find_one({"_id": "whatsapp"}) or {}
    provider = s.get("provider", "meta")
    if provider == "qr":
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(f"{QR_URL}/send", headers={"x-bridge-secret": QR_SECRET}, json={"to": to, "text": body})
            return r.json()
        except Exception as e:
            logger.error(f"QR send failed: {e}")
            return {"error": str(e)}
    token = s.get("access_token")
    if not token:
        return {"simulated": True}
    payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to,
               "type": "text", "text": {"preview_url": False, "body": body}}
    if provider == "360dialog":
        url = "https://waba-v2.360dialog.io/messages"
        headers = {"D360-API-KEY": token, "Content-Type": "application/json"}
    else:
        pnid = s.get("phone_number_id")
        if not pnid:
            return {"simulated": True}
        url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{pnid}/messages"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(url, headers=headers, json=payload)
        return r.json()
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return {"error": str(e)}

@api.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    doc = await _insert_message(conv_id, "out", body.body, user["name"], body.type)
    await send_whatsapp_text(conv.get("contact_phone", ""), body.body)
    return clean(doc)

async def generate_ai_reply(conv_id: str, incoming: str) -> Optional[str]:
    s = await db.settings.find_one({"_id": "bot"}) or {}
    sys = s.get("ai_system_prompt") or ("Você é um atendente virtual cordial de uma empresa. "
        "Responda em português do Brasil de forma breve, educada e útil às mensagens dos clientes no WhatsApp.")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"conv-{conv_id}", system_message=sys).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=incoming))
        return resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logger.error(f"AI reply failed: {e}")
        return None

async def process_incoming(conv_id: str, text: str):
    bot = await db.settings.find_one({"_id": "bot"}) or {}
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
    if not bot.get("bot_enabled", True) or not conv.get("bot_active", True):
        return None
    # keyword rules
    autos = await db.automations.find({"enabled": True}).to_list(200)
    low = text.lower()
    import re as _re
    for a in autos:
        for kw in a.get("keywords", []):
            if kw and _re.search(r"\b" + _re.escape(kw.lower()) + r"\b", low):
                await _insert_message(conv_id, "out", a["response"], "🤖 Bot", "text")
                return a["response"]
    # AI fallback
    if bot.get("ai_enabled", True):
        reply = await generate_ai_reply(conv_id, text)
        if reply:
            await _insert_message(conv_id, "out", reply, "🤖 IA", "text")
            return reply
    return None

@api.post("/conversations/{conv_id}/ai-suggest")
async def ai_suggest(conv_id: str, user: dict = Depends(get_current_user)):
    msgs = await db.messages.find({"conversation_id": conv_id}).sort("created_at", -1).to_list(6)
    last_in = next((m for m in msgs if m["direction"] == "in"), None)
    context = last_in["body"] if last_in else "Cliente iniciou conversa."
    reply = await generate_ai_reply(conv_id, context)
    if not reply:
        raise HTTPException(status_code=502, detail="Não foi possível gerar sugestão com IA")
    return {"suggestion": reply}

@api.post("/simulate/incoming")
async def simulate_incoming(body: SimulateIn, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"_id": ObjectId(body.conversation_id)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    await _insert_message(body.conversation_id, "in", body.body, conv.get("contact_name", "Cliente"))
    bot_reply = await process_incoming(body.conversation_id, body.body)
    return {"ok": True, "bot_reply": bot_reply}

# ================= WHATSAPP WEBHOOK =================
@app.get("/api/webhooks/whatsapp")
async def verify_webhook(request: Request):
    params = request.query_params
    s = await db.settings.find_one({"_id": "whatsapp"}) or {}
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == s.get("verify_token"):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")

@app.post("/api/webhooks/whatsapp")
async def receive_webhook(request: Request):
    event = await request.json()
    for entry in event.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                phone = msg.get("from")
                text = msg.get("text", {}).get("body", "")
                conv = await db.conversations.find_one({"contact_phone": phone})
                if not conv:
                    res = await db.conversations.insert_one({
                        "contact_name": phone, "contact_phone": phone, "channel": "whatsapp",
                        "agent_id": None, "agent_name": None, "status": "open", "bot_active": True,
                        "unread": 0, "last_message": text, "last_message_at": iso(), "created_at": iso()})
                    cid = str(res.inserted_id)
                else:
                    cid = str(conv["_id"])
                await _insert_message(cid, "in", text, phone)
                await process_incoming(cid, text)
    return {"ok": True}

@app.post("/api/whatsapp/qr/incoming")
async def qr_incoming(request: Request):
    if request.headers.get("x-bridge-secret") != QR_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    data = await request.json()
    phone = data.get("from", "")
    text = data.get("text", "")
    name = data.get("name") or phone
    conv = await db.conversations.find_one({"contact_phone": phone}) or await db.conversations.find_one({"contact_phone": "+" + phone})
    if not conv:
        res = await db.conversations.insert_one({
            "contact_name": name, "contact_phone": phone, "channel": "whatsapp",
            "agent_id": None, "agent_name": None, "status": "open", "bot_active": True,
            "unread": 0, "avatar": "", "last_message": text, "last_message_at": iso(), "created_at": iso()})
        cid = str(res.inserted_id)
    else:
        cid = str(conv["_id"])
    await _insert_message(cid, "in", text, name)
    await process_incoming(cid, text)
    return {"ok": True}

@app.post("/api/whatsapp/qr/sync")
async def qr_sync(request: Request):
    if request.headers.get("x-bridge-secret") != QR_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    data = await request.json()
    created = 0
    for ch in data.get("chats", []):
        phone = (ch.get("phone") or "").strip()
        if not phone:
            continue
        name = ch.get("name") or phone
        if await db.conversations.find_one({"contact_phone": phone}):
            continue
        res = await db.conversations.insert_one({
            "contact_name": name, "contact_phone": phone, "channel": "whatsapp",
            "agent_id": None, "agent_name": None, "status": "open", "bot_active": False,
            "unread": 0, "avatar": "", "last_message": (ch.get("last_message") or "")[:80],
            "last_message_at": iso(), "created_at": iso(), "imported": True})
        cid = str(res.inserted_id)
        for m in ch.get("messages", [])[-15:]:
            await db.messages.insert_one({
                "conversation_id": cid, "direction": "out" if m.get("fromMe") else "in",
                "body": m.get("text", ""), "type": "text",
                "sender": "Você" if m.get("fromMe") else name, "status": "read",
                "created_at": m.get("ts") or iso()})
        if not await db.contacts.find_one({"phone": phone}):
            await db.contacts.insert_one({"name": name, "phone": phone, "email": "",
                                          "tags": ["WhatsApp"], "notes": "", "avatar": "", "created_at": iso()})
        created += 1
    return {"ok": True, "created": created}

# ================= TEMPLATES =================
@api.get("/templates")
async def list_templates(user: dict = Depends(get_current_user)):
    rows = await db.templates.find().sort("created_at", -1).to_list(500)
    return [clean(r) for r in rows]

@api.post("/templates")
async def create_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump(); doc["created_at"] = iso()
    res = await db.templates.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.put("/templates/{tid}")
async def update_template(tid: str, body: TemplateIn, user: dict = Depends(get_current_user)):
    await db.templates.update_one({"_id": ObjectId(tid)}, {"$set": body.model_dump()})
    return clean(await db.templates.find_one({"_id": ObjectId(tid)}))

@api.delete("/templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    await db.templates.delete_one({"_id": ObjectId(tid)})
    return {"ok": True}

# ================= AUTOMATIONS & BOT SETTINGS =================
@api.get("/automations")
async def list_automations(user: dict = Depends(get_current_user)):
    rows = await db.automations.find().sort("created_at", -1).to_list(500)
    return [clean(r) for r in rows]

@api.post("/automations")
async def create_automation(body: AutomationIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump(); doc["created_at"] = iso()
    res = await db.automations.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.put("/automations/{aid}")
async def update_automation(aid: str, body: AutomationIn, admin: dict = Depends(require_admin)):
    await db.automations.update_one({"_id": ObjectId(aid)}, {"$set": body.model_dump()})
    return clean(await db.automations.find_one({"_id": ObjectId(aid)}))

@api.delete("/automations/{aid}")
async def delete_automation(aid: str, admin: dict = Depends(require_admin)):
    await db.automations.delete_one({"_id": ObjectId(aid)})
    return {"ok": True}

@api.get("/settings/bot")
async def get_bot_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"_id": "bot"}) or {}
    s.pop("_id", None)
    return s

@api.put("/settings/bot")
async def set_bot_settings(body: BotSettingsIn, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"_id": "bot"}, {"$set": body.model_dump()}, upsert=True)
    return body.model_dump()

@api.get("/settings/whatsapp")
async def get_whatsapp_settings(admin: dict = Depends(require_admin)):
    s = await db.settings.find_one({"_id": "whatsapp"}) or {}
    s.pop("_id", None)
    if s.get("access_token"):
        s["access_token_set"] = True
        s["access_token"] = ""
    return s

@api.put("/settings/whatsapp")
async def set_whatsapp_settings(body: WhatsAppSettingsIn, admin: dict = Depends(require_admin)):
    data = body.model_dump()
    if not data.get("access_token"):
        existing = await db.settings.find_one({"_id": "whatsapp"}) or {}
        data["access_token"] = existing.get("access_token", "")
    data["connected"] = bool(data.get("access_token") and data.get("phone_number_id"))
    await db.settings.update_one({"_id": "whatsapp"}, {"$set": data}, upsert=True)
    return {"connected": data["connected"], "provider": data.get("provider", "meta"),
            "phone_number_id": data.get("phone_number_id"),
            "business_phone": data.get("business_phone"), "display_name": data.get("display_name")}

@api.get("/whatsapp/qr/status")
async def qr_status(admin: dict = Depends(require_admin)):
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{QR_URL}/status", headers={"x-bridge-secret": QR_SECRET})
        return r.json()
    except Exception as e:
        return {"status": "unavailable", "qr": None, "error": str(e)}

@api.post("/whatsapp/qr/logout")
async def qr_logout(admin: dict = Depends(require_admin)):
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{QR_URL}/logout", headers={"x-bridge-secret": QR_SECRET})
        return r.json()
    except Exception as e:
        return {"error": str(e)}

# ================= CALLS =================
@api.get("/calls")
async def list_calls(user: dict = Depends(get_current_user)):
    rows = await db.calls.find().sort("created_at", -1).to_list(500)
    return [clean(r) for r in rows]

@api.post("/calls")
async def create_call(contact_name: str = Form(...), contact_phone: str = Form(...),
                      direction: str = Form("inbound"), duration: int = Form(0),
                      notes: str = Form(""), agent_name: str = Form(""),
                      recording: Optional[UploadFile] = File(None), user: dict = Depends(get_current_user)):
    rec_data = None
    if recording is not None:
        content = await recording.read()
        rec_data = f"data:{recording.content_type};base64," + base64.b64encode(content).decode()
    doc = {"contact_name": contact_name, "contact_phone": contact_phone, "direction": direction,
           "duration": duration, "notes": notes, "agent_name": agent_name or user["name"],
           "recording": rec_data, "created_at": iso()}
    res = await db.calls.insert_one(doc)
    return clean({**doc, "_id": res.inserted_id})

@api.delete("/calls/{cid}")
async def delete_call(cid: str, user: dict = Depends(get_current_user)):
    await db.calls.delete_one({"_id": ObjectId(cid)})
    return {"ok": True}

# ================= DASHBOARD =================
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    total_conv = await db.conversations.count_documents({})
    open_conv = await db.conversations.count_documents({"status": "open"})
    total_contacts = await db.contacts.count_documents({})
    total_agents = await db.users.count_documents({})
    total_msgs = await db.messages.count_documents({})
    total_calls = await db.calls.count_documents({})
    # agent leaderboard
    agents = await db.users.find().to_list(200)
    leaderboard = []
    for a in agents:
        cnt = await db.conversations.count_documents({"agent_id": str(a["_id"])})
        leaderboard.append({"name": a["name"], "conversations": cnt, "status": a.get("status", "offline")})
    leaderboard.sort(key=lambda x: x["conversations"], reverse=True)
    # messages per day (last 7)
    per_day = []
    for i in range(6, -1, -1):
        day = (now_utc() - timedelta(days=i)).date().isoformat()
        cnt = await db.messages.count_documents({"created_at": {"$regex": f"^{day}"}})
        per_day.append({"day": day[5:], "messages": cnt})
    return {"total_conversations": total_conv, "open_conversations": open_conv,
            "total_contacts": total_contacts, "total_agents": total_agents,
            "total_messages": total_msgs, "total_calls": total_calls,
            "avg_response_min": 3.2, "csat": 4.6,
            "leaderboard": leaderboard[:6], "messages_per_day": per_day}

# ================= SEED =================
async def seed():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_requests.create_index("email")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"email": admin_email, "password_hash": hash_password(admin_password),
                                   "name": "Quedison (Admin)", "role": "admin", "status": "online",
                                   "token_version": 0, "created_at": iso()})
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    if await db.settings.find_one({"_id": "bot"}) is None:
        await db.settings.update_one({"_id": "bot"}, {"$set": {
            "bot_enabled": True, "ai_enabled": True,
            "welcome_message": "Olá! 👋 Bem-vindo à nossa central de atendimento. Como podemos ajudar?",
            "away_message": "Estamos fora do horário. Retornaremos em breve!",
            "ai_system_prompt": ""}}, upsert=True)
    if await db.settings.find_one({"_id": "whatsapp"}) is None:
        await db.settings.update_one({"_id": "whatsapp"}, {"$set": {
            "phone_number_id": "", "access_token": "", "verify_token": "zapdesk-verify-2026",
            "business_phone": "+55 11 90000-0000", "display_name": "ZapDesk Demo", "connected": False}}, upsert=True)

    # demo attendants
    demo_agents = [
        ("carlos@zapdesk.com", "Carlos Mendes", "https://images.pexels.com/photos/7681362/pexels-photo-7681362.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "online"),
        ("beatriz@zapdesk.com", "Beatriz Rocha", "https://images.pexels.com/photos/7709255/pexels-photo-7709255.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "busy"),
        ("mariana@zapdesk.com", "Mariana Alves", "https://images.unsplash.com/photo-1580489944761-15a19d654956?crop=entropy&cs=srgb&fm=jpg&q=85&w=400", "offline"),
    ]
    agent_ids = {}
    for email, name, avatar, status in demo_agents:
        u = await db.users.find_one({"email": email})
        if not u:
            r = await db.users.insert_one({"email": email, "password_hash": hash_password("Atende@2026"),
                                           "name": name, "role": "attendant", "status": status,
                                           "avatar": avatar, "token_version": 0, "created_at": iso()})
            agent_ids[name] = str(r.inserted_id)
        else:
            agent_ids[name] = str(u["_id"])

    if await db.templates.count_documents({}) == 0:
        await db.templates.insert_many([
            {"title": "Saudação", "category": "Geral", "shortcut": "/oi", "body": "Olá {{nome}}! Tudo bem? Sou da equipe de atendimento. Como posso ajudar hoje?", "created_at": iso()},
            {"title": "Aguardando", "category": "Geral", "shortcut": "/aguarde", "body": "Só um momento, {{nome}}, já estou verificando isso para você. 😊", "created_at": iso()},
            {"title": "Protocolo", "category": "Suporte", "shortcut": "/protocolo", "body": "Seu atendimento foi registrado sob o protocolo {{protocolo}}. Guarde este número.", "created_at": iso()},
            {"title": "Encerramento", "category": "Geral", "shortcut": "/tchau", "body": "Foi um prazer atender você, {{nome}}! Precisando, estamos à disposição. 🙏", "created_at": iso()},
            {"title": "Boleto 2ª via", "category": "Financeiro", "shortcut": "/boleto", "body": "Para gerar a 2ª via do boleto, acesse: exemplo.com/boleto e informe seu CPF.", "created_at": iso()},
        ])

    if await db.automations.count_documents({}) == 0:
        await db.automations.insert_many([
            {"name": "Saudação inicial", "keywords": ["oi", "olá", "ola", "bom dia", "boa tarde"], "response": "Olá! 👋 Bem-vindo à ZapDesk. Digite: 1 para Suporte, 2 para Financeiro, 3 para Falar com atendente.", "enabled": True, "created_at": iso()},
            {"name": "Financeiro", "keywords": ["2", "boleto", "pagamento", "financeiro"], "response": "💳 Setor Financeiro: para 2ª via de boleto acesse exemplo.com/boleto. Deseja falar com um atendente? Digite 3.", "enabled": True, "created_at": iso()},
            {"name": "Suporte", "keywords": ["1", "suporte", "problema", "ajuda"], "response": "🛠️ Suporte técnico: descreva o problema que você está enfrentando que um atendente irá te ajudar.", "enabled": True, "created_at": iso()},
        ])

    if await db.statuses.count_documents({}) == 0:
        await db.statuses.insert_many([
            {"label": "Disponível", "color": "#10B981", "created_at": iso()},
            {"label": "Em atendimento", "color": "#F59E0B", "created_at": iso()},
            {"label": "Em almoço", "color": "#6366F1", "created_at": iso()},
            {"label": "Ausente", "color": "#6B7280", "created_at": iso()},
        ])

    if await db.contacts.count_documents({}) == 0:
        contacts = [
            {"name": "Ana Silva", "phone": "+55 11 98765-4321", "email": "ana@email.com", "tags": ["VIP", "Lead"], "notes": "Cliente interessada no plano premium.", "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&q=85&w=400", "created_at": iso()},
            {"name": "João Pereira", "phone": "+55 21 99876-1234", "email": "joao@email.com", "tags": ["Suporte"], "notes": "", "avatar": "", "created_at": iso()},
            {"name": "Empresa XYZ", "phone": "+55 11 3000-1000", "email": "contato@xyz.com", "tags": ["VIP"], "notes": "Conta corporativa.", "avatar": "", "created_at": iso()},
            {"name": "Marcos Souza", "phone": "+55 31 98111-2222", "email": "", "tags": ["Inadimplente"], "notes": "Pendência financeira.", "avatar": "", "created_at": iso()},
            {"name": "Fernanda Lima", "phone": "+55 47 99333-4444", "email": "fe@email.com", "tags": ["Lead"], "notes": "", "avatar": "", "created_at": iso()},
        ]
        await db.contacts.insert_many(contacts)

    if await db.conversations.count_documents({}) == 0:
        convs = [
            {"contact_name": "Ana Silva", "contact_phone": "+55 11 98765-4321", "channel": "whatsapp",
             "agent_id": agent_ids.get("Carlos Mendes"), "agent_name": "Carlos Mendes", "status": "open",
             "bot_active": False, "unread": 2, "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
             "msgs": [("in", "Olá, gostaria de saber sobre o plano premium", "Ana Silva"),
                      ("out", "Olá Ana! Claro, o plano premium inclui atendimento prioritário e recursos exclusivos.", "Carlos Mendes"),
                      ("in", "Qual o valor mensal?", "Ana Silva"),
                      ("in", "E tem desconto anual?", "Ana Silva")]},
            {"contact_name": "João Pereira", "contact_phone": "+55 21 99876-1234", "channel": "whatsapp",
             "agent_id": None, "agent_name": None, "status": "open", "bot_active": True, "unread": 1, "avatar": "",
             "msgs": [("in", "oi", "João Pereira"),
                      ("out", "Olá! 👋 Bem-vindo à ZapDesk. Digite: 1 para Suporte, 2 para Financeiro, 3 para Falar com atendente.", "🤖 Bot"),
                      ("in", "1", "João Pereira")]},
            {"contact_name": "Marcos Souza", "contact_phone": "+55 31 98111-2222", "channel": "whatsapp",
             "agent_id": agent_ids.get("Beatriz Rocha"), "agent_name": "Beatriz Rocha", "status": "pending",
             "bot_active": False, "unread": 0, "avatar": "",
             "msgs": [("in", "Preciso resolver uma pendência", "Marcos Souza"),
                      ("out", "Olá Marcos, verifiquei aqui e temos um boleto em aberto. Posso te enviar a 2ª via?", "Beatriz Rocha")]},
        ]
        for c in convs:
            msgs = c.pop("msgs")
            c["last_message"] = msgs[-1][1][:80]
            c["last_message_at"] = iso()
            c["created_at"] = iso()
            r = await db.conversations.insert_one(c)
            cid = str(r.inserted_id)
            base = now_utc() - timedelta(minutes=len(msgs) * 3)
            for idx, (d, b, s) in enumerate(msgs):
                await db.messages.insert_one({"conversation_id": cid, "direction": d, "body": b, "type": "text",
                                              "sender": s, "status": "read", "created_at": iso(base + timedelta(minutes=idx * 3))})

    if await db.calls.count_documents({}) == 0:
        await db.calls.insert_many([
            {"contact_name": "Ana Silva", "contact_phone": "+55 11 98765-4321", "direction": "inbound", "duration": 245, "notes": "Cliente perguntou sobre plano premium.", "agent_name": "Carlos Mendes", "recording": None, "created_at": iso()},
            {"contact_name": "Marcos Souza", "contact_phone": "+55 31 98111-2222", "direction": "outbound", "duration": 132, "notes": "Cobrança amigável de pendência.", "agent_name": "Beatriz Rocha", "recording": None, "created_at": iso()},
        ])

    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"""# Test Credentials

## Admin (owner)
- Email: {admin_email}
- Senha: {admin_password}
- Role: admin

## Atendentes demo (role: attendant)
- carlos@zapdesk.com / Atende@2026
- beatriz@zapdesk.com / Atende@2026
- mariana@zapdesk.com / Atende@2026

## Auth endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/refresh
- GET /api/auth/me
- POST /api/auth/forgot-password, /api/auth/reset-password
""")

@app.on_event("startup")
async def on_startup():
    await seed()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

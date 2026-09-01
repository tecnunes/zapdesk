"""ZapDesk backend API tests - covers auth, agents, contacts, conversations, messages,
templates, automations, bot/whatsapp settings, calls, dashboard."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "quedison.tecnunn@gmail.com"
ADMIN_PASS = "Admin@2026"
ATT_EMAIL = "carlos@zapdesk.com"
ATT_PASS = "Atende@2026"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def attendant_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ATT_EMAIL, "password": ATT_PASS})
    assert r.status_code == 200, f"Attendant login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------------- AUTH ----------------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert "password_hash" not in data["user"]

    def test_bad_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin_client):
        r = admin_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_and_login(self):
        email = f"test_reg_{int(time.time())}@zapdesk.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Pass@1234", "name": "Test Reg"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "attendant"
        # cleanup via admin
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        tok = lr.json()["access_token"]
        agents = s.get(f"{API}/agents", headers={"Authorization": f"Bearer {tok}"}).json()
        uid = next(a["id"] for a in agents if a["email"] == email)
        s.delete(f"{API}/agents/{uid}", headers={"Authorization": f"Bearer {tok}"})

    def test_forgot_password_generic(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nonexistent@zapdesk.com"})
        assert r.status_code == 200
        assert "message" in r.json()

    def test_role_gating_admin_only_endpoint(self, attendant_client):
        r = attendant_client.get(f"{API}/settings/whatsapp")
        assert r.status_code == 403


# ---------------- AGENTS ----------------
class TestAgents:
    def test_list_agents(self, admin_client):
        r = admin_client.get(f"{API}/agents")
        assert r.status_code == 200
        agents = r.json()
        assert len(agents) >= 4
        emails = [a["email"] for a in agents]
        assert ADMIN_EMAIL in emails
        assert ATT_EMAIL in emails

    def test_create_and_delete_agent(self, admin_client):
        email = f"test_agent_{int(time.time())}@zapdesk.com"
        r = admin_client.post(f"{API}/agents", json={"email": email, "password": "Pass@1234", "name": "TEST Agent"})
        assert r.status_code == 200
        aid = r.json()["id"]
        # verify
        agents = admin_client.get(f"{API}/agents").json()
        assert any(a["id"] == aid for a in agents)
        # delete
        d = admin_client.delete(f"{API}/agents/{aid}")
        assert d.status_code == 200

    def test_attendant_cannot_create_agent(self, attendant_client):
        r = attendant_client.post(f"{API}/agents", json={"email": "x@x.com", "password": "x", "name": "x"})
        assert r.status_code == 403


# ---------------- CONTACTS ----------------
class TestContacts:
    def test_list_contacts_seeded(self, admin_client):
        r = admin_client.get(f"{API}/contacts")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_crud_contact(self, admin_client):
        payload = {"name": "TEST_Contact", "phone": "+55 11 90000-1111", "email": "t@t.com", "tags": ["TEST"], "notes": "n"}
        r = admin_client.post(f"{API}/contacts", json=payload)
        assert r.status_code == 200
        cid = r.json()["id"]
        # update
        payload["name"] = "TEST_Contact_Upd"
        u = admin_client.put(f"{API}/contacts/{cid}", json=payload)
        assert u.status_code == 200
        assert u.json()["name"] == "TEST_Contact_Upd"
        # search
        s = admin_client.get(f"{API}/contacts", params={"q": "TEST_Contact_Upd"})
        assert any(c["id"] == cid for c in s.json())
        # delete
        d = admin_client.delete(f"{API}/contacts/{cid}")
        assert d.status_code == 200


# ---------------- CONVERSATIONS & MESSAGES ----------------
class TestConversations:
    def test_list_conversations_seeded(self, admin_client):
        r = admin_client.get(f"{API}/conversations")
        assert r.status_code == 200
        convs = r.json()
        assert len(convs) >= 3
        # each item has expected keys
        assert "contact_name" in convs[0]
        assert "id" in convs[0]

    def test_get_conversation_clears_unread(self, admin_client):
        convs = admin_client.get(f"{API}/conversations").json()
        target = next((c for c in convs if c.get("unread", 0) > 0), convs[0])
        cid = target["id"]
        r = admin_client.get(f"{API}/conversations/{cid}")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["messages"], list)
        # NOTE: endpoint returns pre-clear snapshot; verify persistence via next list call
        convs2 = admin_client.get(f"{API}/conversations").json()
        assert next(c for c in convs2 if c["id"] == cid)["unread"] == 0

    def test_send_message(self, admin_client):
        cid = admin_client.get(f"{API}/conversations").json()[0]["id"]
        before = len(admin_client.get(f"{API}/conversations/{cid}").json()["messages"])
        r = admin_client.post(f"{API}/conversations/{cid}/messages", json={"body": "TEST outgoing"})
        assert r.status_code == 200
        after = admin_client.get(f"{API}/conversations/{cid}").json()["messages"]
        assert len(after) == before + 1
        assert after[-1]["body"] == "TEST outgoing"
        assert after[-1]["direction"] == "out"

    def test_simulate_incoming_triggers_bot(self, admin_client):
        # find a conversation with bot_active true; else toggle
        convs = admin_client.get(f"{API}/conversations").json()
        conv = next((c for c in convs if c.get("bot_active")), None)
        if not conv:
            conv = convs[0]
            admin_client.post(f"{API}/conversations/{conv['id']}/toggle-bot")
        cid = conv["id"]
        before = len(admin_client.get(f"{API}/conversations/{cid}").json()["messages"])
        r = admin_client.post(f"{API}/simulate/incoming", json={"conversation_id": cid, "body": "oi"})
        assert r.status_code == 200
        # incoming + bot keyword reply = +2
        msgs = admin_client.get(f"{API}/conversations/{cid}").json()["messages"]
        assert len(msgs) >= before + 2
        # last message should be bot response containing menu keyword
        assert "🤖" in msgs[-1]["sender"] or "Bot" in msgs[-1]["sender"]

    def test_toggle_bot(self, admin_client):
        cid = admin_client.get(f"{API}/conversations").json()[0]["id"]
        r = admin_client.post(f"{API}/conversations/{cid}/toggle-bot")
        assert r.status_code == 200
        assert "bot_active" in r.json()
        # toggle back
        admin_client.post(f"{API}/conversations/{cid}/toggle-bot")

    def test_assign_agent(self, admin_client):
        cid = admin_client.get(f"{API}/conversations").json()[0]["id"]
        agents = admin_client.get(f"{API}/agents").json()
        att = next(a for a in agents if a["role"] == "attendant")
        r = admin_client.post(f"{API}/conversations/{cid}/assign", json={"agent_id": att["id"]})
        assert r.status_code == 200
        assert r.json()["agent_id"] == att["id"]

    def test_ai_suggest(self, admin_client):
        cid = admin_client.get(f"{API}/conversations").json()[0]["id"]
        r = admin_client.post(f"{API}/conversations/{cid}/ai-suggest")
        # AI may occasionally fail; accept 200 or 502
        assert r.status_code in (200, 502), f"Unexpected {r.status_code}: {r.text}"
        if r.status_code == 200:
            assert isinstance(r.json().get("suggestion"), str)
            assert len(r.json()["suggestion"]) > 0


# ---------------- TEMPLATES ----------------
class TestTemplates:
    def test_list_templates_seeded(self, admin_client):
        r = admin_client.get(f"{API}/templates")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_crud_template(self, admin_client):
        r = admin_client.post(f"{API}/templates", json={"title": "TEST_T", "category": "Geral", "body": "Hi", "shortcut": "/tst"})
        assert r.status_code == 200
        tid = r.json()["id"]
        u = admin_client.put(f"{API}/templates/{tid}", json={"title": "TEST_T2", "category": "Geral", "body": "Hi2", "shortcut": "/tst"})
        assert u.status_code == 200 and u.json()["title"] == "TEST_T2"
        d = admin_client.delete(f"{API}/templates/{tid}")
        assert d.status_code == 200


# ---------------- AUTOMATIONS ----------------
class TestAutomations:
    def test_list_seeded(self, admin_client):
        r = admin_client.get(f"{API}/automations")
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_crud(self, admin_client):
        r = admin_client.post(f"{API}/automations", json={"name": "TEST_A", "keywords": ["xyz"], "response": "R", "enabled": True})
        assert r.status_code == 200
        aid = r.json()["id"]
        u = admin_client.put(f"{API}/automations/{aid}", json={"name": "TEST_A2", "keywords": ["xyz"], "response": "R2", "enabled": False})
        assert u.status_code == 200
        d = admin_client.delete(f"{API}/automations/{aid}")
        assert d.status_code == 200

    def test_attendant_forbidden(self, attendant_client):
        r = attendant_client.post(f"{API}/automations", json={"name": "x", "keywords": [], "response": "r"})
        assert r.status_code == 403


# ---------------- SETTINGS ----------------
class TestSettings:
    def test_bot_settings(self, admin_client):
        r = admin_client.get(f"{API}/settings/bot")
        assert r.status_code == 200
        r2 = admin_client.put(f"{API}/settings/bot", json={"bot_enabled": True, "ai_enabled": True,
                                                            "welcome_message": "Hi", "away_message": "Bye",
                                                            "ai_system_prompt": ""})
        assert r2.status_code == 200

    def test_whatsapp_settings(self, admin_client):
        r = admin_client.get(f"{API}/settings/whatsapp")
        assert r.status_code == 200
        r2 = admin_client.put(f"{API}/settings/whatsapp", json={"phone_number_id": "", "access_token": "",
                                                                  "verify_token": "zapdesk-verify-2026",
                                                                  "business_phone": "+55 11 90000-0000",
                                                                  "display_name": "ZapDesk Demo"})
        assert r2.status_code == 200


# ---------------- CALLS ----------------
class TestCalls:
    def test_list_seeded(self, admin_client):
        r = admin_client.get(f"{API}/calls")
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_create_call_no_recording(self, admin_client):
        # multipart form
        s = requests.Session()
        s.headers.update({"Authorization": admin_client.headers["Authorization"]})
        r = s.post(f"{API}/calls", data={"contact_name": "TEST_Caller", "contact_phone": "+55 11 90000-0000",
                                          "direction": "inbound", "duration": "60", "notes": "n", "agent_name": "Admin"})
        assert r.status_code == 200
        cid = r.json()["id"]
        d = admin_client.delete(f"{API}/calls/{cid}")
        assert d.status_code == 200

    def test_create_call_with_recording(self, admin_client):
        s = requests.Session()
        s.headers.update({"Authorization": admin_client.headers["Authorization"]})
        files = {"recording": ("test.mp3", io.BytesIO(b"fakeaudio"), "audio/mpeg")}
        r = s.post(f"{API}/calls",
                   data={"contact_name": "TEST_Rec", "contact_phone": "+55 11 90000-0000",
                         "direction": "inbound", "duration": "10", "notes": "", "agent_name": ""},
                   files=files)
        assert r.status_code == 200
        assert r.json().get("recording", "").startswith("data:audio/mpeg;base64,")
        admin_client.delete(f"{API}/calls/{r.json()['id']}")


# ---------------- DASHBOARD ----------------
class TestDashboard:
    def test_stats(self, admin_client):
        r = admin_client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ["total_conversations", "total_contacts", "total_agents", "total_messages",
                  "leaderboard", "messages_per_day"]:
            assert k in data
        assert len(data["messages_per_day"]) == 7

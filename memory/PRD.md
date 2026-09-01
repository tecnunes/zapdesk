# ZapDesk — Central de Atendimento WhatsApp (PRD)

## Problem Statement (original, verbatim)
"e possivel desenvolver uma aplicacao que Organize atendimentos Whatsapp . neste caso conectar com whatsapp chatbot, mensagens personalizadas, gravacao de ligacao , gerenciar atendentes, gerenciar lista contatos, ... me de oque da pra fazer"

## User Choices
- WhatsApp: official Business Cloud API (Meta), credentials provided by user
- Chatbot: keyword rules AND AI
- Scope: all features
- Voice calls: real calls desired (MVP = call log + audio recording upload/playback)
- Auth: login with role levels (Admin vs Attendant)

## Architecture
- FastAPI + MongoDB (motor), single server.py, all routes under /api
- Auth: JWT Bearer (localStorage) + httpOnly cookies; roles admin/attendant; full reset flow
- Integrations: WhatsApp Cloud API (send text/template + webhook receive), Anthropic claude-sonnet-4-6 via emergentintegrations (Emergent LLM key)
- React 19 + Tailwind + shadcn/ui, dark theme (Outfit/Plus Jakarta Sans), recharts

## Personas
- Admin/owner: configures bot, WhatsApp connection, agents, sees analytics
- Attendant: works the inbox, contacts, templates, calls

## Implemented (2026-06)
- Auth: register/login/logout/me/refresh/forgot/reset, brute-force lockout, admin seed
- Inbox: 3-pane (list/thread/CRM), send, simulate incoming, keyword+AI bot auto-reply, AI suggest, bot toggle, agent assign
- Contacts CRM (CRUD + tags + search), Quick-reply Templates (CRUD, categories, variables)
- Chatbot settings + keyword automations (CRUD, admin), Agents management (admin)
- Analytics dashboard (stats, messages/day chart, leaderboard), WhatsApp Connection center (settings + webhook guide, demo mode)
- Calls: log + audio recording upload/playback (speed controls)
- Seed demo data on startup. Tested: backend 30/30, frontend 16/16.

## Backlog / Remaining
- P1: Real in-browser voice calling (WebRTC/Twilio) — currently call-log + recording only
- P1: Media messages (images/audio/docs) send+receive via Cloud API; object storage for recordings
- P2: Real-time via WebSocket (currently 5s polling); business-hours away routing; CSAT survey capture
- P2: WhatsApp approved template message sending UI

## Test Credentials
- Admin: quedison.tecnunn@gmail.com / Admin@2026
- Attendants: carlos|beatriz|mariana@zapdesk.com / Atende@2026

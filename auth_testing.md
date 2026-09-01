# Auth Testing Notes (ZapDesk)
- Admin: quedison.tecnunn@gmail.com / Admin@2026 (role admin)
- Demo attendants: carlos@zapdesk.com, beatriz@zapdesk.com, mariana@zapdesk.com — all password Atende@2026
- Auth uses JWT Bearer token returned in login/register body (stored in localStorage) + httpOnly cookies.
- Endpoints under /api/auth: register, login, logout, me, refresh, forgot-password, reset-password
- Password reset link is logged to backend only when FRONTEND_URL is loopback; in preview it emails.

# OpenWA — End-to-End Setup Guide (Docker)

Self-hosted WhatsApp HTTP API using [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).
Works with a **personal WhatsApp number** — no Business API account needed.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone & Build](#clone--build)
3. [Critical Patch — 50 MB body limit](#critical-patch--50-mb-body-limit)
4. [Run with Docker](#run-with-docker)
5. [First-run: Create a Session & Scan QR](#first-run-create-a-session--scan-qr)
6. [Generate an API Key](#generate-an-api-key)
7. [Backend Integration (NestJS / Express)](#backend-integration-nestjs--express)
8. [API Reference](#api-reference)
9. [Environment Variables](#environment-variables)
10. [Troubleshooting](#troubleshooting)
11. [Production Notes](#production-notes)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker | 24+ |
| Docker Compose | v2 (plugin) |
| Node.js (for local dev only) | 22+ |

You need a **personal WhatsApp number** available to scan a QR code during setup.

---

## Clone & Build

```bash
git clone <your-openwa-repo-url> OpenWA
cd OpenWA
```

The repo ships two Compose files:

| File | Use |
|------|-----|
| `docker-compose.dev.yml` | Quick start — SQLite, no extras |
| `docker-compose.yml` | Production — profiles for Postgres, Redis, MinIO, Traefik |

---

## Critical Patch — 50 MB body limit

> **Must do this before building.** Without it, sending large PDFs or images will
> return HTTP 413 from OpenWA.

Edit `src/main.ts`. In the `bootstrap()` function, add the body-limit lines
immediately after `NestFactory.create`:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ↓ Add these three lines ↓
  const { json, urlencoded } = await import('express');
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  // ↑ End of addition ↑

  // ... rest of bootstrap stays unchanged
}
```

The default limit is ~100 KB, which silently rejects any base64-encoded file
over ~75 KB.

---

## Run with Docker

### Development (recommended for first setup)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

This starts:
- **OpenWA API** on `http://localhost:2785`
- **Dashboard UI** on `http://localhost:2886`
- SQLite database persisted in `./data/openwa.sqlite`
- Session files in `./data/sessions/`

### Production (with Traefik proxy)

```bash
# API only (no proxy)
docker compose up -d --build openwa-api

# API + Traefik reverse proxy
docker compose --profile with-proxy up -d --build

# Full stack (API + proxy + dashboard)
docker compose --profile full up -d --build
```

### Verify it's running

```bash
curl http://localhost:2785/api/health
# → {"status":"ok"}
```

Swagger docs: `http://localhost:2785/api/docs`

---

## First-run: Create a Session & Scan QR

### 1. Open the Dashboard

Navigate to `http://localhost:2886` (dev) or your proxy URL.

### 2. Create a session

Click **New Session**, enter a name (e.g. `myapp`), click **Create**.

Or via API:

```bash
curl -X POST http://localhost:2785/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"name": "myapp"}'
```

### 3. Start the session & scan QR

In the Dashboard, click **Start** on your new session.
A QR code will appear — scan it from the WhatsApp app on your phone:

> WhatsApp → Settings → Linked Devices → Link a Device

### 4. Confirm it's connected

```bash
curl http://localhost:2785/api/sessions
# Look for "status": "CONNECTED" in the response
```

Note the `id` field — this is the UUID you'll need. Example:
```json
[{ "id": "35c694c2-64d0-4626-8827-b94dcd933832", "name": "myapp", "status": "CONNECTED" }]
```

---

## Generate an API Key

### In the Dashboard

1. Go to **Settings → API Keys**
2. Click **Generate Key**
3. Copy the key — it looks like `owa_k1_<hex>`

### Via API (after first run)

```bash
curl -X POST http://localhost:2785/api/api-keys \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-backend"}'
```

All subsequent requests need `X-API-Key: <your-key>` header.

---

## Backend Integration (NestJS / Express)

### Environment Variables

Add to your backend's `.env`:

```env
OPENWA_URL=http://localhost:2785/api
OPENWA_SESSION=myapp
OPENWA_API_KEY=owa_k1_<your-key>
OPENWA_COUNTRY_CODE=91
```

> `OPENWA_SESSION` can be either the **name** (`myapp`) or the **UUID**
> (`35c694c2-...`). The service resolves names to UUIDs automatically.

### Raise your backend's body limit too

If your NestJS/Express backend proxies file data to OpenWA, it also needs the
50 MB limit:

```typescript
// src/main.ts
const app = await NestFactory.create(AppModule, { bodyParser: false });
const { json, urlencoded } = await import('express');
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));
```

### WhatsApp Service (drop-in NestJS service)

```typescript
// whatsapp.service.ts
@Injectable()
export class WhatsAppService {
  private resolvedSessionId: string | null = null;

  /** Send a plain text message */
  async sendText(rawPhone: string, text: string): Promise<boolean> {
    const { base, headers, chatId, sid } = await this.setup(rawPhone);
    if (!base) return false;

    const res = await fetch(`${base}/sessions/${sid}/messages/send-text`, {
      method: 'POST', headers,
      body: JSON.stringify({ chatId, text }),
    });
    return res.ok;
  }

  /**
   * Send an image with caption.
   * base64: raw base64 string — NO "data:image/jpeg;base64," prefix.
   * mimetype: e.g. "image/jpeg"
   */
  async sendImage(rawPhone: string, base64: string, mimetype: string, filename: string, caption: string): Promise<boolean> {
    const { base, headers, chatId, sid } = await this.setup(rawPhone);
    if (!base) return false;

    const rawB64 = base64.startsWith('data:') ? base64.split(',')[1] : base64;

    const res = await fetch(`${base}/sessions/${sid}/messages/send-image`, {
      method: 'POST', headers,
      body: JSON.stringify({ chatId, base64: rawB64, mimetype, filename, caption }),
    });
    return res.ok;
  }

  /**
   * Send a PDF or other document.
   * base64: raw base64 string (no data URI prefix).
   */
  async sendDocument(rawPhone: string, buffer: Buffer, filename: string, caption: string): Promise<boolean> {
    const { base, headers, chatId, sid } = await this.setup(rawPhone);
    if (!base) return false;

    const base64 = buffer.toString('base64');
    const res = await fetch(`${base}/sessions/${sid}/messages/send-document`, {
      method: 'POST', headers,
      body: JSON.stringify({ chatId, base64, mimetype: 'application/pdf', filename, caption }),
    });
    return res.ok;
  }

  /**
   * Check if a number is registered on WhatsApp.
   * Returns true/false/null (null = session offline or check failed).
   *
   * This fork does not have a dedicated /check-number endpoint.
   * We use the profile-picture endpoint as a proxy: returns { url: string }
   * for WhatsApp users and { url: null } for numbers not on WhatsApp.
   */
  async isOnWhatsApp(rawPhone: string): Promise<boolean | null> {
    const { base, headers, chatId, sid } = await this.setup(rawPhone);
    if (!base) return null;

    const res = await fetch(
      `${base}/sessions/${sid}/contacts/${encodeURIComponent(chatId)}/profile-picture`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.url != null && data.url !== '';
  }

  // --- Private helpers ---

  private async setup(rawPhone: string) {
    const base = process.env.OPENWA_URL?.replace(/\/$/, '');
    const session = process.env.OPENWA_SESSION;
    const apiKey = process.env.OPENWA_API_KEY;
    const empty = { base: null, headers: {}, chatId: '', sid: '' };

    if (!base || !session) return empty;

    const chatId = this.toChatId(rawPhone);
    if (!chatId) return empty;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const sessionId = await this.resolveSessionId(base, session, headers);
    if (!sessionId) return empty;

    return { base, headers, chatId, sid: encodeURIComponent(sessionId) };
  }

  private async resolveSessionId(base: string, session: string, headers: Record<string, string>): Promise<string | null> {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(session)) return session;
    if (this.resolvedSessionId) return this.resolvedSessionId;

    const res = await fetch(`${base}/sessions`, { headers });
    if (!res.ok) return null;
    const list = (await res.json()) as Array<{ id: string; name: string }>;
    const match = list.find(s => s.name === session || s.id === session);
    if (match) { this.resolvedSessionId = match.id; return match.id; }
    return null;
  }

  private toChatId(raw: string): string {
    const cc = (process.env.OPENWA_COUNTRY_CODE || '91').replace(/^\+/, '');
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    let n = digits.startsWith('0') ? cc + digits.slice(1) : digits;
    if (!n.startsWith(cc)) n = cc + n;
    return n.length >= 10 ? `${n}@c.us` : '';
  }
}
```

### NestJS Controller Example

```typescript
@UseGuards(JwtAuthGuard)
@Post('send-pdf')
async sendPdf(@Req() req, @Body() body: { phone: string; base64: string; filename: string; caption?: string }) {
  if (req.user?.role !== 'admin') throw new ForbiddenException();
  const buffer = Buffer.from(body.base64, 'base64');
  const ok = await this.whatsapp.sendDocument(body.phone, buffer, body.filename, body.caption || '');
  return { ok };
}

@UseGuards(JwtAuthGuard)
@Post('send-image')
async sendImage(@Req() req, @Body() body: { phone: string; base64: string; mimetype: string; filename: string; caption?: string }) {
  if (req.user?.role !== 'admin') throw new ForbiddenException();
  const ok = await this.whatsapp.sendImage(body.phone, body.base64, body.mimetype, body.filename, body.caption || '');
  return { ok };
}

@UseGuards(JwtAuthGuard)
@Get('check/:phone')
async checkNumber(@Req() req, @Param('phone') phone: string) {
  if (req.user?.role !== 'admin') throw new ForbiddenException();
  const onWhatsApp = await this.whatsapp.isOnWhatsApp(phone);
  return { phone, onWhatsApp };
}
```

### Frontend — sending a file (Next.js / React)

```typescript
// Use FileReader for large files — avoids stack overflow on btoa()
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Send PDF
const base64 = await fileToBase64(file);
await fetch('/api/whatsapp/send-pdf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ phone: '919876543210', base64, filename: file.name, caption: 'Your document' }),
});

// Send image
const base64 = await fileToBase64(file);
await fetch('/api/whatsapp/send-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ phone: '919876543210', base64, mimetype: file.type, filename: file.name, caption: 'Your image' }),
});
```

---

## API Reference

All endpoints are prefixed with `/api`. Pass `X-API-Key: <key>` header.

### Sessions

```
GET  /api/sessions                    List all sessions (returns id, name, status)
POST /api/sessions                    Create a new session { name }
GET  /api/sessions/:id                Get session details
DELETE /api/sessions/:id              Delete session
POST /api/sessions/:id/start          Start / reconnect session
POST /api/sessions/:id/stop           Stop session
GET  /api/sessions/:id/qr-code        Get current QR code (base64 PNG)
```

### Messages

```
POST /api/sessions/:id/messages/send-text
  Body: { chatId, text }

POST /api/sessions/:id/messages/send-image
  Body: { chatId, base64, mimetype, filename, caption }
  ⚠️  base64 must be RAW (no "data:image/...;base64," prefix)
  ⚠️  mimetype must be a separate field, not baked into base64

POST /api/sessions/:id/messages/send-document
  Body: { chatId, base64, mimetype, filename, caption }
  ⚠️  Same rules: raw base64, separate mimetype
```

### Contacts

```
GET /api/sessions/:id/contacts/:chatId/profile-picture
  Returns: { url: string | null }
  Use: proxy for "is this number on WhatsApp?" — url !== null means yes
```

### Health

```
GET /api/health        → { status: "ok" }
```

### chatId format

All message endpoints use `chatId` in the format `{phone}@c.us`.
For India: `919876543210@c.us`

---

## Environment Variables

### OpenWA (set in `docker-compose.dev.yml` or `.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `2785` | Port OpenWA listens on |
| `DATABASE_TYPE` | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_NAME` | `/app/data/openwa.sqlite` | SQLite file path |
| `ENGINE_TYPE` | `whatsapp-web.js` | WhatsApp engine (only option) |
| `SESSION_DATA_PATH` | `/app/data/sessions` | Where session files are stored |
| `PUPPETEER_HEADLESS` | `true` | Keep true in Docker |
| `PUPPETEER_ARGS` | `--no-sandbox,...` | Required Chrome flags for Docker |
| `STORAGE_TYPE` | `local` | `local` or `s3` |
| `API_MASTER_KEY` | *(empty)* | If set, all requests require this key |

### Your Backend

| Variable | Example | Description |
|----------|---------|-------------|
| `OPENWA_URL` | `http://localhost:2785/api` | OpenWA base URL |
| `OPENWA_SESSION` | `myapp` | Session name or UUID |
| `OPENWA_API_KEY` | `owa_k1_...` | API key from OpenWA dashboard |
| `OPENWA_COUNTRY_CODE` | `91` | Default dialling code for bare numbers |

---

## Troubleshooting

### Session shows as disconnected after container restart

The Chrome session lock file prevents reconnect:

```bash
# Find and remove the lock file
find ./data/sessions -name 'SingletonLock' -delete
docker compose restart openwa-api
```

Then rescan the QR code in the dashboard.

### HTTP 413 on send-image / send-document

You missed the [50 MB body limit patch](#critical-patch--50-mb-body-limit).
Apply it to `src/main.ts` and rebuild: `docker compose up -d --build`.

### `send-image` returns 500 with base64

You're sending a data URI (`data:image/jpeg;base64,...`) instead of raw base64.
Strip the prefix before sending:

```typescript
const rawB64 = base64.startsWith('data:') ? base64.split(',')[1] : base64;
```

### "Could not resolve session" / session not found

The session was re-created after a restart and has a new UUID.
Check the current UUID:

```bash
curl -H 'X-API-Key: <key>' http://localhost:2785/api/sessions
```

Update `OPENWA_SESSION` in your backend `.env` to the new name or UUID,
then restart the backend.

### Port already in use

```bash
lsof -ti:2785 | xargs kill -9   # Kill process on OpenWA port
lsof -ti:2886 | xargs kill -9   # Kill process on Dashboard port
```

### `btoa` stack overflow on large files (frontend)

Do **not** use `btoa(String.fromCharCode(...new Uint8Array(buf)))` for files
over ~1 MB — it overflows the call stack.
Use `FileReader.readAsDataURL()` instead (see [frontend example](#frontend--sending-a-file-nextjs--react)).

---

## Production Notes

### WhatsApp session longevity

Sessions survive container restarts as long as `./data/sessions` is persisted
(the dev Compose mounts it as a bind volume). Re-scanning QR is only needed
if WhatsApp logs out the session remotely (usually after ~2 weeks of inactivity
or if you log out from the phone).

### Interactive buttons not available

This uses the personal WhatsApp web interface — **interactive buttons (CTAs)
are not available**. They require the official WhatsApp Business API (Cloud API
or an approved BSP). Link previews work normally.

### Rate limiting

WhatsApp will ban numbers that send too many messages too fast.
Recommended: max ~50 messages/day from a single number, with at least 2-3
seconds between sends.

### Scaling

One OpenWA container = one WhatsApp number. To serve multiple numbers,
run multiple containers on different ports with different session names.

### Backing up sessions

```bash
# Backup
tar -czf openwa-sessions-$(date +%Y%m%d).tar.gz ./data/sessions ./data/openwa.sqlite

# Restore
tar -xzf openwa-sessions-20250101.tar.gz
```

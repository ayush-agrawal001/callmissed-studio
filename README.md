# CallMissed Studio

A full-stack web app for the CallMissed voice AI platform. Users can **talk to a real-time voice agent**, **chat with LLMs** and **generate images**. Every model call goes through the [CallMissed API](https://docs.callmissed.com), and no other external AI API is used.

- **Live app:** _add hosted URL_
- **Stack:** Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, `livekit-client` for WebRTC audio, Docker + Caddy on AWS EC2

## Features

### 🎙️ Voice agent (`/voice`)
- Real-time speech-to-speech over **WebRTC**. The server creates a CallMissed voice session (`POST /v1/voice/sessions`) and the browser joins the media room with `livekit-client`.
- Four ready-made personas (general assistant, restaurant booking host, mock interviewer, Hinglish buddy), each with fully editable instructions and opening line.
- Choice of speech engine (Cartesia **Sonic 3.6** or Sarvam **Bulbul v3** Indic voices), voice, language (7 Indian languages) and LLM (Gemma 4 31B or Sarvam 105B).
- **Live transcript** with interim captions, an audio-reactive orb, and the agent's state (listening / thinking / speaking). It supports mute, barge-in (talk over the agent to interrupt it) and a countdown to the 5-minute call limit.
- **Post-call summary** built from the session API: duration, turn count, average time to first audio, the stored transcript, and the call's actual cost broken down by STT / LLM / TTS (`/transcript`, `/cost`).
- Hanging up, closing the tab or navigating away all end the session server-side (`DELETE /v1/voice/sessions/{id}`) so it stops billing.

### 💬 Chat (`/chat`)
- Token streaming. CallMissed's SSE stream is parsed on the server and re-emitted as compact NDJSON, and a stream that ends without `[DONE]` is reported as an error, as the docs specify.
- Five models (Gemma 4, Kimi K2.6, GLM 4.7 Flash, Sarvam 105B, GPT-OSS 120B), with a **Thinking** toggle that maps to `reasoning_effort` and shows the model's reasoning trace in a collapsible panel.
- Markdown and GFM rendering (code blocks, tables), stop, regenerate, copy, **read aloud** (`/v1/audio/speech`) and token counts.
- Multiple conversations, saved in the browser.

### 🖼️ Image studio (`/images`)
- `/v1/images/generations` with five models (FLUX.2 Klein, Phoenix, Lucid Origin, SDXL Lightning, DreamShaper). Each shows its per-image credit cost.
- Aspect-ratio presets, negative prompt, seed for reproducible results, and a "Surprise me" prompt button.
- Gallery stored in IndexedDB (base64 images are too big for localStorage), with a lightbox, download, delete and "reuse settings".

## Architecture

```
Browser ──HTTPS──▶ Next.js route handlers ──Bearer cm_…──▶ api.callmissed.com
   │                 /api/chat     (SSE → NDJSON stream)
   │                 /api/images
   │                 /api/tts
   │                 /api/voice/session        (create → ws_url + one-time JWT)
   │                 /api/voice/session/:ticket (transcript + cost, end call)
   │
   └──WebRTC (livekit-client, JWT from above)──▶ CallMissed media server ◀─▶ voice agent (STT → LLM → TTS)
```

| Concern | How it's handled |
|---|---|
| **API key secrecy** | The key exists only in server env vars. The browser receives just the per-call WebRTC URL and its one-hour token. |
| **Session isolation** | The browser never receives raw voice session ids. It gets an HMAC-signed *ticket*, so a visitor can read the transcript and cost of their own calls only. |
| **Budget protection** | The app is public and runs on a capped $20 budget. Every paid route has per-IP rate limits, and a global daily credit ceiling (`DAILY_CREDIT_BUDGET`, default 250 credits ≈ $2.60) rejects new work once reached. Voice calls are capped at 5 minutes, images at 1 per request, chat at 4K output tokens. |
| **Input validation** | Model ids, voices, sizes and languages are checked against an allow-list (`src/lib/catalog.ts`), and message and prompt lengths are bounded before anything reaches the API. |
| **Error UX** | Upstream errors (402 out of credits, 429, content-policy refusals, 5xx) are mapped to readable messages, and an upstream auth error is never shown as the user's fault. |
| **Security headers** | `Permissions-Policy` allows the microphone on this origin only, plus `nosniff`, `X-Frame-Options: DENY` and a strict referrer policy. |

The rate limiter and budget counter live in process memory. That is correct for the single-instance EC2 deployment. A multi-instance deployment would move them to Redis.

### Project layout

```
src/
  app/
    api/chat/route.ts              streaming chat proxy
    api/images/route.ts            image generation
    api/tts/route.ts               read-aloud
    api/voice/session/…            voice session create / summary / end
    api/status/route.ts            health check + today's estimated spend
    chat/  images/  voice/         pages (client components)
    voice/useVoiceCall.ts          LiveKit room lifecycle hook
  lib/catalog.ts                   models, voices, personas (shared by UI and API)
  lib/server/callmissed.ts         server-only API client + error mapping
  lib/server/guard.ts              rate limits, daily budget, signed tickets
deploy/                            docker-compose + Caddy + EC2 bootstrap
```

## Run locally

```bash
cp .env.example .env.local      # add your CALLMISSED_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Microphone access works on `localhost`. Any other host needs HTTPS.

## Deploy (AWS EC2 free tier)

The production setup is one `t3.micro`/`t2.micro` instance running two containers: the Next.js standalone server, and **Caddy**, which obtains a Let's Encrypt certificate automatically. HTTPS is required because browsers only allow the microphone on secure origins. Without a domain, the free `<ip-with-dashes>.sslip.io` hostname resolves to the instance and gets a valid certificate.

1. Launch an Amazon Linux 2023 or Ubuntu instance (free-tier eligible). In its security group, allow inbound **80** and **443** (and 22 for SSH).
2. SSH in and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/ec2-setup.sh | bash -s -- https://github.com/<you>/<repo>.git
   ```
   The script adds swap (a 1 GB instance can't build Next.js otherwise), installs Docker and Compose, asks for the API key (stored in `.env.production`, mode 600), and starts the stack. It then prints the HTTPS URL.
3. To redeploy after a push: `cd app && git pull && sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`.

The image builds from the repo's `Dockerfile` (multi-stage, non-root user, health check on `/api/status`, about 230 MB).

## Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `CALLMISSED_API_KEY` | yes | — | CallMissed `cm_` key |
| `DAILY_CREDIT_BUDGET` | no | `250` | Global daily spend ceiling in credits |
| `SESSION_SECRET` | no | derived from key | HMAC secret for voice session tickets |

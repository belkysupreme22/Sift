# Sift — Telegram Channel Timeline

Sift is a minimalist, chronological reading interface and companion bot for Telegram channels. It aggregates updates from your subscribed channels, normalizes them into structured storage, and presents them in a fast, scannable timeline — preserving complete, unedited stories with full multi-language script fidelity.

---

## 🏛️ Conceptual Architecture

```
                                  ┌───────────────────────────┐
                                  │      Telegram Cloud       │
                                  │  (MTProto / Bot Platform) │
                                  └─────────────┬─────────────┘
                                                │
                                    Encrypted MTProto Sync
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Sift Unified Service                            │
│                                                                             │
│   ┌────────────────────────┐                    ┌───────────────────────┐   │
│   │   Interactive Bot      │                    │  SvelteKit Web Engine │   │
│   │   (grammY Companion)   │                    │  (Responsive Timeline)│   │
│   └───────────┬────────────┘                    └───────────┬───────────┘   │
│               │                                             │               │
│               └──────────────────────┬──────────────────────┘               │
│                                      │                                      │
│                                      ▼                                      │
│                       ┌─────────────────────────────┐                       │
│                       │    PostgreSQL Data Store    │                       │
│                       │   (Channels, Stories, Auth) │                       │
│                       └─────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Chronological Integrity**: Stories are grouped chronologically by Day, Week, and Month without algorithmic curation or distortion.
2. **Text & Script Fidelity**: Multi-byte UTF-8 preservation ensures scripts (including Amharic, Ge'ez, Arabic, and CJK) render with flawless typographic accuracy.
3. **Single-Process Co-location**: The web application and the Telegram bot runtime operate within a unified, lightweight Node.js service for minimal operational overhead.
4. **Volume-Adaptive Visual Hierarchy**: Channels and metrics dynamically adapt visual weight based on posting cadence and volume share.

---

## 🛠️ Tech Stack

- **Frontend / Fullstack**: SvelteKit (Svelte 5 Runes), Tailwind CSS, Lucide Icons
- **Backend / Telegram Layer**: Node.js, `@sveltejs/adapter-node`, `grammY`, `gramjs` (MTProto)
- **Database & ORM**: PostgreSQL, Drizzle ORM
- **Deployment Target**: Cloud Node.js Container / Alet Solo

---

## 🚀 Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Push database schema
pnpm run db:push

# 3. Start local development server
pnpm run dev
```

---

## 📦 Production Build

```bash
# Compile and build SSR bundle
pnpm run build

# Start production server
pnpm start
```

---

## ☁️ Deployment Guide (Alet / Cloud Platforms)

1. **Create Database**: Provision a managed PostgreSQL instance.
2. **Deploy Application**: Connect your GitHub repository to your hosting platform.
3. **Apply Migrations**: Run `pnpm run db:push` during build or in the deployment shell.
4. **Launch**: Start the service via `node build` (or `pnpm start`).

---

## 📄 License

MIT

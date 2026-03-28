---
name: Publish or Perish — Frontend Project
description: YHack 2026 hackathon frontend for AI-powered multiplayer study game
type: project
---

This is a 24-hour hackathon project for YHack Spring 2026 at Yale. The user is building the frontend (Person 3) for a 4-player social deduction study game called "Publish or Perish."

**Why:** 24-hour hackathon, built from scratch in one session. All pages are fully implemented and building cleanly.

**How to apply:** When asked to extend or fix the frontend, reference these key patterns:
- Socket events contract is defined in `types/game.ts`
- Demo mode activated via `?demo=true` query param — no backend needed
- `npm run dev` works; `node node_modules/next/dist/bin/next build` needed for builds (not `npx next build` — Node v25 symlink issue)
- StringTune custom HTML attributes declared in `types/stringtune.d.ts`
- Lab color system via CSS variables in `app/globals.css` (--lab-void, --lab-bg, --lab-surface, --lab-accent, --lab-danger, --lab-warn)
- Fonts: Space Mono (headings), Outfit (body), Fira Code (code)
- All pages are `"use client"` — socket.io + useState

**Tech stack:** Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, socket.io-client, @fiddle-digital/string-tune, lucide-react

**Backend:** FastAPI + python-socketio on Person 1, Celery AI pipeline on Person 2, MongoDB + upload endpoint on Person 4. API URL: `http://localhost:8000` (dev), env var `NEXT_PUBLIC_API_URL`

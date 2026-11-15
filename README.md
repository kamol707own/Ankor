# AnKor

Master Korean vocabulary with beautiful flashcards. AnKor is a focused, fast study app with spaced repetition, a word browser, rich notes, cloud sharing, and AI-powered categorization.

## Features

- **Smart flashcards** — simplified SM-2 spaced repetition with New / Learning / Review states
- **Word browser** — search, sort, and group your decks by semantic category
- **AI categorization** — auto-group words using Google Gemini or Groq (bring your own free API key)
- **Rich notes editor** — TipTap-powered documents for grammar and study notes
- **Cloud sharing** — upload and download decks & notes via Supabase
- **Daily reminders** — optional notification to review your cards
- **Text-to-speech** — hear each word pronounced
- **Themes & accents** — light/dark mode plus accent colors
- **JSON import/export** — backup and restore your decks

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Framer Motion
- TipTap
- Supabase (cloud sharing + edge functions)
- TanStack Query

## Getting started

Prerequisites: Node.js 18+ and a package manager (npm or pnpm).

```sh
# Install dependencies
npm install
# or
pnpm install

# Start the dev server
npm run dev
# or
pnpm dev
```

The app runs on http://localhost:8080.

## Environment variables

Create a `.env` file in the project root (see `.env` for the current values):

```
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_URL=https://your-project.supabase.co
```

These are required for cloud sharing and the AI categorize feature. You can keep the bundled values to get started, but point them at your own Supabase project for production.

## AI categorization (Gemini / Groq)

The "Categorize with AI" button uses your own free API key — nothing is hardcoded, and no server or edge function is required.

1. Get a free key from [Google AI Studio](https://aistudio.google.com/apikey) (Gemini) or [Groq Cloud](https://console.groq.com/keys).
2. In the app, open **Settings → AI Categorization** and choose your provider, paste the key, and (optionally) set a model.
3. The key is stored only in your browser's localStorage. Requests go straight from your browser to the provider (both allow browser CORS).

> An optional server-side proxy lives at `supabase/functions/categorize-words` if you ever want to route requests through Supabase instead of calling the provider directly.

## Deploying to Vercel

1. Push this repository to GitHub/GitLab.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo.
3. Vercel auto-detects the framework (Vite). No build command changes needed.
4. Add the environment variables above under **Settings → Environment Variables**.
5. Deploy. Client-side routes (`/browser`, `/insights`, `/settings`) are handled by the included `vercel.json` rewrites.

## Project structure

```
src/
  components/    UI components (shadcn/ui + app-specific)
  hooks/         React hooks (localStorage, mobile, toast)
  integrations/  Supabase client + types
  lib/           SRS, speech, reminders
  pages/         Home, Study, WordList, Browser, Insights, Settings
supabase/
  functions/     Edge functions (categorize-words)
  migrations/    Database schema
```

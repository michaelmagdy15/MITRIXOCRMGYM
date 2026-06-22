---
name: workout-mitrixo
description: "An AI-powered fitness tracking application that bridges a Next.js client with an MCP server to enable context-aware natural language coaching and automated planning."
risk: low
source: user
date_added: "2026-06-10"
---

# MITRIXO Workout (Health & Fitness Coach MCP)

## 1️⃣ Purpose & Scope
- **Overview**: MITRIXO Workout is a comprehensive AI-powered fitness tracking ecosystem that integrates a visual Next.js frontend with an intelligent Model Context Protocol (MCP) server. It bridges the gap between traditional manual tracking apps and conversational AI assistants (such as Cursor or Claude Desktop) by enabling seamless, bi-directional sharing of fitness history, metrics, and coaching targets.
- **Core Features**:
  - **Conversational AI Coach**: Real-time natural language interaction with an OpenAI-backed virtual coach to log activities, query progress, and seek guidance.
  - **MCP Integration**: Standardized Server-Sent Events (SSE) and HTTP endpoints exposing 7 protocol-compliant tools for external AI clients to read/write fitness records.
  - **Dynamic Activity & Nutrition Logging**: Visual interfaces to track workout sessions (cardio vs. strength), detailed nutrition macronutrients, subjective feedback, and daily steps.
  - **Offline Synchronization Engine**: Resilient client-side caching that queues user activities during network drops and automatically flushes logs on reconnection.
  - **Readiness-Based Scaling**: A startup questionnaire calculating readiness scores to scale workout volume and weights dynamically.
  - **PDF Handout Exporter**: A Python-based document generator compiling customized training regimens into multi-page PDFs.

## 2️⃣ Technology Stack & Dependencies
- **Core Languages**: TypeScript, Python, HTML/JS, Shell Scripting.
- **Frontend & App Framework**: Next.js 15 (App Router), React 19, Tailwind CSS.
- **State Management & Server Stores**: In-memory file-backed stores (`.tmp/*.json`) and singleton instances on the server; client-side caching in `localStorage`.
- **Database (Conceptual)**: PostgreSQL schema (documented in `database-schema.sql`) supporting multi-user configurations, exercise libraries, template splits, and progressive overload logs.
- **AI Stack & Protocols**: `@modelcontextprotocol/sdk` (Model Context Protocol), OpenAI Node SDK (`gpt-4o-mini`).
- **Dependencies & Tools**: `@clerk/nextjs` (Authentication), `@upstash/redis` (Redis/Upstash caching for SSE transport layer scaling), `@radix-ui` primitives, FPDF (Python library for PDF report generation).

## 3️⃣ Project Structure & Key Files
### Summary of Folder Hierarchy
- `app/`: Next.js pages, layout templates, and API endpoints (chat, log tracking, context viewing, plan generator, MCP server routes).
- `components/`: UI modules, including trackers (workouts/meals), sidebar navigation, readiness checks, settings panels, and chat layout.
- `lib/`: Library abstractions for mock authentication, API routing fetch utilities, Redis configuration, and file stores.
- `tools/`: MCP tool implementations (`log-workout`, `log-nutrition`, `log-feedback`, `generate-plan`, `view-context`, `set-weekly-target`, `echo`).
- `utils/`: Core utilities for singleton memory mapping and OpenAI LLM completions.
- `scripts/`: Verification scripts for HTTP streaming, stdio remote debugger, and deeplinks.

### Key File Mapping
| File Path | Purpose / Description | Key Symbols (Classes, Functions, Constants) |
| --- | --- | --- |
| `app/page.tsx` | Main Fitness Dashboard orchestrator containing layout tabs and hooks integration. | `FitnessApp` |
| `app/mcp/route.ts` | MCP server entry route setting up Vercel MCP handler and registering tools. | `handler` |
| `app/api/chat/route.ts` | Process user prompts, detects specific intent patterns, and maps responses via MCP or fallback. | `POST`, `detectUserIntent`, `handleActivityLogging` |
| `app/api/context/route.ts` | Combined context fetcher that blends local storage progress metrics with backend MCP data. | `GET`, `transformMcpContextToFrontend` |
| `app/api/log/route.ts` | Input validator routing logged metrics both locally and to corresponding MCP handlers. | `POST`, `storeDataLocally` |
| `hooks/useFitnessData.ts` | Client sync engine handling offline queueing, cache backups, and auto-sync triggers. | `useFitnessData`, `flushOfflineQueue` |
| `utils/memoryStore.ts` | Map-based user cache interface used as the primary data persistence layer for the MCP server. | `MemoryStore`, `memoryStore` |
| `utils/llmClient.ts` | Integrates OpenAI SDK to construct detailed prompts and generate plans with standard fallbacks. | `generatePlan`, `openai` |
| `lib/stores.ts` | Server-side backup store maintaining workout and meal states in the `.tmp/` sandbox. | `workoutStore`, `nutritionStore`, `mirnaPlan` |
| `lib/auth.tsx` | Auto-detection fallback wrapper mock for Clerk auth to prevent startup crashes when keys are missing. | `ClerkProvider`, `useUser`, `Show` |
| `generate_pdf.py` | Standalone Python script utilizing FPDF to output a formatted workout handout. | `WorkoutPDF`, `create_workout_pdf` |

## 4️⃣ Setup, Commands & Scripts
### Installation
1. Install project dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
2. Set up Python environment for PDF generation:
   ```bash
   pip install fpdf
   ```

### Running Locally
- Run the Next.js development server:
  ```bash
  npm run dev
  # or
  pnpm dev
  ```
  The web app loads at `http://localhost:3000` and the MCP server exposes endpoints at `http://localhost:3000/mcp` or `http://localhost:3000/sse`.

### PDF Handout Generation
- Run the PDF script:
  ```bash
  python generate_pdf.py
  ```
  Generates `mirna_workout_plan.pdf` in the root workspace folder.

### Testing & Verification
- Test standard MCP fitness tools:
  ```bash
  npm run test:fitness
  ```
- Test SSE transport connectivity:
  ```bash
  npm run test:sse
  ```
- Test HTTP streamable connection:
  ```bash
  npm run test:http
  ```

### Environmental Configuration
Configure a `.env.local` file with the following variables:
- `OPENAI_API_KEY`: API token for GPT-4o-mini plan generation.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publisher key (omitting activates Mock Auth).
- `UPSTASH_REDIS_REST_URL`: Upstash URL (optional, enables production SSE).
- `UPSTASH_REDIS_REST_TOKEN`: Upstash security token (optional).
- `REDIS_URL`: Local redis client string (optional fallback).
- `DEFAULT_USER_ID`: Override identifier (default: `default-user`).

## 5️⃣ Architecture & Key Workflows
### High-Level Data Flow
```
[ User Chat Prompt ] ──> [ /api/chat (Intent Match) ]
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
          [ Local Store Cache ]       [ MCP Server /mcp POST ]
                   │                           │
                   │                           ▼
                   │                  [ utils/memoryStore ]
                   │                           │
                   └─────────────┬─────────────┘
                                 ▼
                     [ Combined Context Response ]
```

### Key Workflows
1. **Offline Queueing & Sync**:
   - When a user logs an activity (workout/meal/steps) and `navigator.onLine` is false, `useFitnessData.ts` serializes the payload, generates a temporary `mock-id`, and stashes it in the `fwp-offline-queue` localStorage key.
   - The UI optimistically increases today's totals using the offline state.
   - Once a window `online` event fires, the sync engine sequentializes POST calls to `/api/log` to upload the queued logs and refreshes the unified true state.
2. **Readiness Adjustments**:
   - The startup readiness checklist scores user stats. If indicators suggest fatigue, the UI applies a `shouldScale` flag that scales down target exercises, reps, or estimated durations dynamically to prevent training overload.

## 6️⃣ Limitations & Constraints
- **Ephemeral Sandbox Environment**: The local server storage is configured to always clear previous JSON log files (`workouts.json`, `nutrition.json`, etc.) in `.tmp/` on startup. Data is not preserved permanently across server restarts.
- **Mock Auth Vulnerabilities**: Bypassing Clerk using mock logic defaults user IDs to `default-user`. While highly useful for development, admin pages (`/admin` and `/api/debug`) will expose raw parameters if run in production without valid keys.
- **OpenAI Key Dependency**: Weekly plan generation completely relies on OpenAI completion endpoints. If keys are missing, the client falls back to static hardcoded recommendations.

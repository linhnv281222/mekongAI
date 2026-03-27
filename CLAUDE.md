# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mekong AI** (package name: `mekong-ai`) — An AI-powered system for Viet Nhat Tan (VNT), a CNC precision machining company. It reads mechanical engineering drawings (PDF/STEP), extracts structured data, and integrates with an ERP system for quotation generation.

The system has two main components:
1. **API Server** (`server.js`) — Web UI + REST API for uploading and analyzing drawings
2. **Email Agent** (`email_agent_v2.js`) — Autonomous Gmail scanner that detects RFQ emails, classifies them, reads attached drawings, and pushes quotation data to ERP

## Commands

```bash
npm start          # Start API server (port 3000)
npm run dev        # Start with --watch for auto-reload
npm run agent      # Run email agent (Gmail scanner)
npm run oauth      # Gmail OAuth setup (one-time)
```

Production with PM2:
```bash
pm2 start server.js --name ai-banve
pm2 start email_agent_v2.js --name mekong-agent
```

## Architecture

### Data Pipeline Flow

```
Gmail (every 30s) → Classify (Haiku) → If RFQ: Split PDF pages → AI read each page (Sonnet) → Enrich with F7/F8 → Push to ERP
```

### Key Modules

- **`analyzer.js`** — Core drawing analysis using Claude Sonnet. Sends PDF as base64 document to Claude API with a detailed JSON schema and VNT-specific domain knowledge (material conversion tables JIS/DIN/AISI→VNT, heat treatment, surface treatment). Uses prompt caching for system prompt and schema. Also handles STEP file analysis and PDF+STEP merging.
- **`gemini_analyzer.js`** — Alternative analyzer using Google Gemini API. Same schema and VNT knowledge as `analyzer.js`, used as backup model.
- **`process_router.js`** — Post-AI enrichment: calculates billet weight (Field 7) using material density tables, selects VNT process routing codes (Field 8, e.g., QT111-QT616), and analyzes machining complexity score.
- **`step_parser.js`** — Parses STEP (ISO-10303-21) files to extract bounding box, diameters, hole features — no AI tokens needed.
- **`email_agent_v2.js`** — Full pipeline: Gmail OAuth → fetch unread → classify with Haiku → download PDF attachments → split pages → call `/drawings` API → create ERP quote header → push line items. Stores jobs in `agent_jobs.json` and optionally PostgreSQL.
- **`db.js`** — PostgreSQL layer for the `drawings` table (stores analysis results). Uses `pg` Pool with `DATABASE_URL`.

### AI Models Used

- **Claude Sonnet (`claude-sonnet-4-6`)** — Drawing analysis and correction (in `analyzer.js`)
- **Claude Haiku (`claude-haiku-4-5-20251001`)** — Email classification (in `email_agent_v2.js`, uses raw fetch to Anthropic API)
- **Gemini 2.5 Pro/Flash** — Backup drawing analysis (in `gemini_analyzer.js`)

### Domain Knowledge (VNT-specific)

The system embeds extensive Vietnamese-Japanese-French-English material conversion tables in `analyzer.js` and `gemini_analyzer.js`. These map international standards (DIN, AISI, EN AW, JIS) to VNT internal codes. Key concepts:
- **kieu_phoi** (billet type): Phi tron dac, Phi tron ong, Hinh tam, Luc giac, Hon hop
- **QT codes** in `process_router.js`: QT1xx=turning, QT2xx/4xx/6xx=milling (by size), routing depends on shape, size class, and number of machining faces
- **F7/F8 enrichment**: F7=weight calculation, F8=process routing code selection

### API Endpoints

- `POST /drawings` — Upload single PDF page, returns structured JSON
- `POST /drawings/batch` — Upload multi-page PDF, splits and reads each page
- `POST /drawings/:id/correct` — Chat-based correction of analysis results
- `GET /drawings` / `GET /drawings/:id` — List/get drawing records
- `GET /jobs` / `GET /jobs/:id` — List/get email agent jobs
- `POST /jobs/:id/push-erp` — Push job to ERP

### Environment

- **Runtime**: Node.js with ES modules (`"type": "module"` in package.json)
- **Database**: PostgreSQL (optional for email agent, required for drawings API)
- **Storage**: `uploads/` for temporary PDF files (auto-cleaned), `agent_jobs.json` for job state
- **ERP integration**: Bearer token auth, mock mode when `ERP_BEARER_TOKEN` not set

### Frontend Pages

- `index.html` — Single drawing upload/analysis UI
- `demo.html` / `demo_v3.html` — Realtime pipeline demo
- `sheet_bao_gia.html` — Quotation sheet view

### `AI_banve_FULL/` Directory

Contains a snapshot/backup of the full system. Same structure as root but may be out of date.

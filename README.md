# SceneMind AI — Video Indexing & Semantic Clipping Platform

SceneMind AI is a complete, production-ready web application for **AI-powered video indexing and semantic video clipping**, built to support long videos (up to 2+ hours), multimodal AI scene understanding, vector similarity search, second-pass AI timestamp verification, and frame-accurate FFmpeg sub-clip extraction.

---

## 1. System Architecture

```text
                         ┌─────────────────────┐
                         │      Web UI         │
                         │ Next.js 14 / React  │
                         └──────────┬──────────┘
                                    │
                              Upload Video
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Backend API     │
                         │ Next.js App Router  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Video Processing    │
                         │    Queue & SSE      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Gemini Video AI     │
                         │ Scene Analysis      │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
              Scene metadata                Description
              timestamps                    /actions/etc.
                     │                             │
                     │                             ▼
                     │                    Embedding generation
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                              Vector Database
                           (Embedded / Pinecone)
                                    │
                                    ▼
                           Semantic Search API
                                    │
                                    ▼
                           AI Timestamp Verify
                                    │
                                    ▼
                               FFmpeg
                                    │
                                    ▼
                              Video Clip
```

---

## 2. Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide Icons, HTML5 Video Player with range-seeking support.
- **Backend**: Next.js Route Handlers (Node.js runtime), Server-Sent Events (SSE) for real-time progress streaming.
- **AI Models**: Google Gemini 2.5 Flash / Pro (`@google/generative-ai`), Gemini Text Embeddings (`text-embedding-004`), with high-fidelity deterministic offline AI simulator when running keyless or in demo mode.
- **Video & Media Processing**: FFmpeg 8.1 and FFprobe for duration/resolution/codec inspection, scene poster extraction, and asynchronous clip cutting.
- **Vector Database**: Abstracted `VectorService` supporting zero-dependency Embedded Cosine Index and Pinecone.
- **Database**: Relational, transactional persistent store (`data/scenemind-store.json`) with atomic synchronization.

---

## 3. Directory Structure

```text
├── app/
│   ├── api/
│   │   ├── clips/                # Clip listings and retrieval
│   │   ├── costs/                # AI cost analytics endpoint
│   │   ├── demo/seed/            # Generates & indexes synthetic 5-scene test video
│   │   ├── events/               # Server-Sent Events (SSE) live stream
│   │   ├── jobs/                 # Processing job status and retry
│   │   ├── media/[...path]/      # HTTP 206 Partial Content video streaming
│   │   ├── scenes/[id]/          # Scene inspection, delete, and re-index
│   │   ├── search/               # Global cross-video semantic search
│   │   └── videos/               # Video upload, detail, and local search
│   ├── index/[id]/page.tsx       # Visual Timeline Scene Explorer
│   ├── search/page.tsx           # Cross-Video Global Semantic Search
│   ├── testing/page.tsx          # Developer Testbed & Diagnostics
│   ├── videos/page.tsx           # Video Upload & Library Dashboard
│   ├── videos/[id]/page.tsx      # Video Player & Scene Cards
│   ├── videos/[id]/search/page.tsx # Local Video Semantic Search
│   ├── globals.css               # Dark theme & glassmorphic styling
│   ├── layout.tsx                # Root layout & navigation
│   └── page.tsx                  # Executive Dashboard & KPI Metrics
├── components/
│   ├── ClipModal.tsx             # Modal dialog for video trimming & downloading
│   ├── Navbar.tsx                # Top navigation bar with active job counter
│   ├── TimelineBar.tsx           # Continuous color-coded visual timeline
│   └── VideoPlayer.tsx           # Custom video player with scrubbing & markers
├── lib/
│   ├── db/
│   │   ├── store.ts              # ACID file-backed database engine
│   │   └── types.ts              # TypeScript schema interfaces
│   └── services/
│       ├── embedding.service.ts  # Canonical text builder & vectorizer
│       ├── ffmpeg.service.ts     # Metadata extraction, thumbnail, and clipping
│       ├── job-queue.service.ts  # Resumable, idempotent processing queue
│       ├── pricing.service.ts    # Centralized cost auditing & calculation
│       ├── storage.service.ts    # Local filesystem & S3 storage abstraction
│       ├── timestamp-verification.service.ts # AI second-pass boundary refinement
│       ├── vector.service.ts     # Vector database abstraction (Embedded / Pinecone)
│       └── video-analysis.service.ts # Gemini video understanding & schema recovery
├── prompts/
│   ├── search-reranking.ts       # Query expansion and semantic matching prompt
│   ├── timestamp-verification.ts # Boundary refinement and event validation prompt
│   └── video-analysis.ts         # Multimodal video understanding prompt
├── scripts/
│   ├── test-pipeline.js          # Automated verification test suite
│   └── verify-live.js            # Live end-to-end API pipeline validation script
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## 4. Setup & Running Instructions

### Prerequisites
- Node.js 18+ (tested on Node v22.15.1)
- FFmpeg & FFprobe installed and in PATH (already detected and configured)

### 1. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

```env
# Google Gemini API Key (optional - if omitted, built-in intelligent AI simulator is used)
GEMINI_API_KEY=your_gemini_api_key_here

# Models
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Vector Provider ("embedded" or "pinecone")
VECTOR_STORE_PROVIDER=embedded
PINECONE_API_KEY=
PINECONE_INDEX=

# Storage Provider
STORAGE_PROVIDER=local
STORAGE_DIR=./storage
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Automated Tests
```bash
npm run test:pipeline
```

### 4. Build and Run the Application
For production:
```bash
npm run build
npm run start
```
For development:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. End-to-End Demo Workflow

1. Open **[http://localhost:3000](http://localhost:3000)**.
2. Click **"Seed Demo Video"** in the top-right navbar.
   - FFmpeg automatically generates a 60-second multi-scene test MP4 containing 5 distinct color-coded semantic scenes (Kitchen conversation, Alley physical fight, Car driving, Park dog walking, and Office building entrance).
   - The background queue indexes the video and computes 768-dimensional embeddings.
3. Once indexed, navigate to the **Semantic Search** tab:
   - Search: `"Find the fight scene"`
   - Result: Returns Scene #2 (`00:12 → 00:25`) with **92% similarity**.
   - AI Timestamp Verification refines the exact action peak to `00:13.3 → 00:24.0` with justification.
4. Click **"Preview"** to seek the player directly to the timestamp.
5. Click **"Create Clip"** to trigger FFmpeg asynchronous clipping.
   - Watch the progress bar advance to 100%.
   - Play the generated clip in the modal and click **"Download MP4 Clip"**.

---

## 6. Estimated AI Cost for a 2-Hour Video

For a typical 2-hour (7,200 seconds) video indexed with Gemini 2.5 Flash:

| Operation | Computation / Token Volume | Model Pricing Rate | Estimated Cost |
| :--- | :--- | :--- | :--- |
| **Multimodal Scene Analysis** | 7,200s video (partitioned into batches) + ~180K prompt tokens | $0.075 / 1M prompt tokens + $0.0018 / min video | **$0.23** |
| **Embedding Generation** | ~120 scenes × 150 tokens = 18,000 tokens | $0.02 / 1M tokens (`text-embedding-004`) | **$0.0004** |
| **Semantic Searches (10 queries)** | 10 queries × 50 tokens = 500 tokens | $0.02 / 1M tokens | **$0.00001** |
| **AI Timestamp Verification (Top 3 matches)** | 3 verification passes × 800 tokens = 2,400 tokens | $0.075 / 1M prompt tokens | **$0.00018** |
| **Total Estimated Cost for 2-Hour Video** | — | — | **~$0.24 USD** |

All rates are centrally configured in `lib/services/pricing.service.ts`.

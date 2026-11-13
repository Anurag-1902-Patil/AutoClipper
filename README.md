# AI Video Clipper 🎬⚡

A personal, production-grade AI tool that converts long YouTube videos into viral, ready-to-post 9:16 vertical short-form clips (YouTube Shorts & Instagram Reels).

Built with **Python 3.11+, FastAPI, React + Vite + Tailwind, FFmpeg, and a provider-agnostic LLM Layer (Gemini, Claude, OpenAI)**.

---

## 🌟 Key Features

1. **Ingest & Caching**:
   - Downloads best-quality video and audio (up to 1080p) using `yt-dlp`.
   - Caches source video and transcript by YouTube Video ID so re-runs are instant.
   - Extracts word-level timestamps (`[{word, start, end}]`) directly via YouTube JSON3 subtitles or caption APIs.
   - Full support for English, Hindi, and Hinglish transcripts with Devanagari font rendering.

2. **2-Pass AI Clip Discovery**:
   - **Pass 1 (Discovery)**: Identifies 5–15 candidate segments with strong curiosity hooks, emotional core, actionable value, and zero dead air.
   - **Pass 2 (Critic)**: Deduplicates overlapping candidate segments (>35% overlap), filters out weak clips (<70 score), sharpens hook headlines, and re-ranks by viral retention potential.
   - Snaps start and end timestamps strictly to sentence and word boundaries (never cuts mid-word).
   - Long transcript handling via sliding-window chunking with 90s sentence-aligned overlap.
   - Token usage and cost tracking in USD per job.

3. **Intelligent 9:16 Vertical Crop & Framing**:
   - **Auto Face Tracking**: Uses OpenCV face detection with temporal smoothing (Exponential Moving Average) to track and frame the active speaker horizontally.
   - **Blurred Background Fill**: Fallback mode for screen recordings, slides, or gameplay (`boxblur` background with centered 16:9 foreground).
   - **Center Crop**: Fast fixed framing fallback.

4. **Animated Word-by-Word Subtitles (ASS via FFmpeg)**:
   - Burns subtitles with native `libass` in FFmpeg at 3x–10x real-time speed.
   - 6+ Built-in presets:
     - **Hormozi Viral**: Bold uppercase, intense yellow active word glow (`#FFDF00`), black outline (`7px`), drop shadow.
     - **Pop & Bounce**: Spring bounce scale transform on the active spoken word with vibrant cyan highlight.
     - **Neon Cyberpunk**: High-contrast cyan text with hot pink glow and deep drop shadow.
     - **Clean Minimal**: Subtle, professional fade with lightweight outline.
     - **Boxed Punch**: High-contrast dark box backing with bright green word highlight.
     - **Hindi / Devanagari**: Tailored for Hindi & Hinglish scripts using `Noto Sans Devanagari` font.
   - Safe zone enforcement: keeps subtitles out of the bottom 20% and right edge to avoid YouTube Shorts and Instagram Reels UI overlays.
   - Optional 3-second animated on-screen hook banner overlay at the top of the video.

5. **Platform-Tuned SEO & Metadata**:
   - **YouTube Shorts**: Title (max 90 chars with `#Shorts`), keyword-rich description with CTA, 3–5 hashtags, search ranking tags.
   - **Instagram Reels**: High-converting caption (hook line + bullet points + engagement CTA) and mixed niche/broad hashtags.
   - Suggested thumbnail capture timestamp & best-time-to-post recommendations.

6. **Interactive Web Editor**:
   - **Live 9:16 Preview**: Real-time interactive subtitle overlay rendered in CSS directly over the video player at 60fps.
   - **Word-by-Word Subtitle Editor**: Fix any misspelled word inline; instantly reflected in live playback.
   - **Subtitle Style Panel**: Adjust fonts, sizes, colors, stroke width, and position, with an "Apply to All Clips" button and "Save as Custom Preset".
   - **Trim Controls**: Adjust start and end times with +/- seconds offset.
   - **Regenerate Hooks & SEO**: Re-prompt AI on demand for fresh titles and captions.
   - **One-Click Copy**: Copy formatted metadata for YouTube and Instagram with a single click.

7. **Batch Export**:
   - Production MP4 export (1080x1920, H.264, AAC, 30fps, ~8-12 Mbps, `-movflags +faststart`).
   - Organized output directory: `/storage/output/<video_title>/` containing `clip_01_<slug>.mp4`, `metadata.json`, and `metadata.csv`.
   - "Open Output Folder" button to open the export directory in Windows File Explorer.

---

## 🏗️ Architecture

```plaintext
Clipper/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server, static mounts & CORS
│   │   ├── config.py            # Settings loader (.env) & base paths
│   │   ├── database.py          # SQLite database schema (jobs, clips, presets)
│   │   ├── core/
│   │   │   ├── job_queue.py     # Background worker & SSE event broadcaster
│   │   │   └── cost_tracker.py  # LLM token counter & cost calculator
│   │   ├── services/
│   │   │   ├── ingest_service.py      # yt-dlp video downloader & metadata fetcher
│   │   │   ├── transcript_service.py  # Word-level transcript extractor
│   │   │   ├── chunker.py             # Sliding-window sentence chunker & snapping
│   │   │   ├── clip_finder.py         # 2-Pass viral clip discovery pipeline
│   │   │   ├── speaker_tracker.py     # OpenCV face tracking & horizontal crop framing
│   │   │   ├── subtitle_generator.py  # Word-by-word ASS generator (6+ styles)
│   │   │   ├── video_processor.py     # FFmpeg frame-accurate cutting & ASS burn-in
│   │   │   └── seo_service.py         # YouTube Shorts & Instagram Reels copy generator
│   │   ├── llm/
│   │   │   ├── base.py                # Abstract LLMProvider with structured JSON validation
│   │   │   ├── gemini_provider.py     # Google Gemini implementation
│   │   │   ├── anthropic_provider.py  # Claude implementation
│   │   │   ├── openai_provider.py     # OpenAI implementation
│   │   │   └── factory.py             # Provider selector
│   │   └── api/
│   │       ├── jobs.py                # Job CRUD, SSE progress stream, resume
│   │       ├── clips.py               # Clip editor updates & preview rendering
│   │       ├── presets.py             # Preset CRUD & apply-to-all
│   │       └── export.py              # Batch export & folder explorer
│   ├── prompts/
│   │   ├── clip_discovery.md          # 1st pass viral discovery prompt
│   │   ├── critic_pass.md             # 2nd pass critic & deduplication prompt
│   │   └── seo_metadata.md            # Shorts & Reels SEO copy prompt
│   ├── tests/                         # 13 automated unit tests
│   └── cli.py                         # Complete CLI interface (ingest, discover, cut, seo)
├── frontend/
│   ├── src/
│   │   ├── components/                # React components (Home, Processing, Dashboard, Editor, Export)
│   │   ├── services/api.ts            # Typed REST & SSE client
│   │   └── types/index.ts             # TypeScript data contracts
│   └── package.json
└── storage/
    ├── cache/                         # Downloaded raw videos
    ├── transcripts/                   # Word-level transcript JSONs
    ├── temp/                          # Intermediate clips & ASS files
    └── output/                        # Final exported MP4s & metadata files
```

---

## 🚀 Quickstart & Setup

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** & **npm**
- **FFmpeg**: Must be installed and available on your system `PATH` (already pre-verified on Windows).

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and configure your preferred LLM provider and API key:
```ini
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Optional alternative providers:
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Run the Application

#### Option A: Running with Web UI (Recommended)

1. **Start the FastAPI Backend**:
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

2. **Access the Web App**:
The backend automatically serves the pre-built React frontend directly at:
```
http://127.0.0.1:8000
```

*(Optional for frontend development with hot-reloading)*:
```powershell
npm run dev --prefix frontend
# Accessible at http://localhost:5173
```

---

## 💻 CLI Commands (Step-by-Step Verification)

The CLI tool allows running and testing every milestone directly from your terminal:

### 1. Ingest Video & Extract Word-Level Captions
```powershell
.\.venv\Scripts\python.exe backend\cli.py ingest "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```
- Fetches video metadata (title, channel, duration, chapters).
- Downloads and caches the 1080p video file in `storage/cache/`.
- Extracts word-level timestamps and saves the JSON to `storage/transcripts/`.

### 2. Discover Viral Clips with AI
```powershell
.\.venv\Scripts\python.exe backend\cli.py discover "https://www.youtube.com/watch?v=jNQXAC9IVRw" --provider gemini
```
- Runs the 2-pass AI pipeline (Discovery + Critic).
- Snaps start and end timestamps to word boundaries.
- Prints virality scores, hook strategies, and token cost breakdown.

### 3. Cut Video, Crop to 9:16 & Burn Animated Subtitles
```powershell
.\.venv\Scripts\python.exe backend\cli.py cut "https://www.youtube.com/watch?v=jNQXAC9IVRw" --start 1.0 --end 10.0 --hook "ELEPHANTS HAVE REALLY LONG TRUNKS" --preset hormozi --framing auto_face
```
- Cuts the clip with frame accuracy.
- Analyzes speaker faces with OpenCV and centers the crop.
- Generates and burns animated word-by-word ASS subtitles.
- Normalizes loudness with `-af loudnorm`.
- Saves the rendered 1080x1920 MP4 into `storage/output/`.

### 4. Generate SEO Metadata for YouTube Shorts & Instagram Reels
```powershell
.\.venv\Scripts\python.exe backend\cli.py seo "https://www.youtube.com/watch?v=jNQXAC9IVRw" --start 1.0 --end 10.0 --hook "WHY ELEPHANTS HAVE TRUNKS" --provider gemini
```
- Outputs high-CTR YouTube title, description, and hashtags.
- Outputs Instagram Reels caption with hook, bullet points, and mixed-size hashtags.
- Suggests thumbnail frame timestamp and best posting window.

---

## 🧪 Running Automated Tests

Run the complete test suite with `pytest`:
```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests
```
Tests cover:
- `test_chunker.py`: Sliding-window transcript chunking with overlap & boundary preservation.
- `test_snapping.py`: Snapping timestamps to word and sentence boundaries.
- `test_llm_base.py`: Robust JSON extraction from markdown code fences and trailing comma repair.
- `test_clip_finder.py`: 2-pass discovery pipeline with mock LLM and token cost tracking.
- `test_subtitles.py`: ASS subtitle script generation across all 6 animation styles & safe zones.
- `test_seo.py`: SEO copy generation and hashtag enforcement.
- `test_api.py`: FastAPI health, preset listing, and custom preset creation.

---

## 🎨 Subtitle Style Presets

| Preset Name | Font | Active Word Color | Outline / Stroke | Safe Zone Alignment | Best For |
|---|---|---|---|---|---|
| **Hormozi Viral** | Montserrat Black | Vivid Gold (`#FFDF00`) | 7px Black | Bottom (440px) | High-energy business, advice & story clips |
| **Pop & Bounce** | Montserrat Black | Neon Cyan (`#00F0FF`) | 6px Black | Bottom (440px) | Educational & fast-paced pacing |
| **Neon Cyberpunk** | Montserrat Bold | Hot Pink (`#FF007F`) | 8px Dark | Bottom (440px) | Gaming, tech & futuristic discussions |
| **Clean Minimal** | Arial Bold | Soft White (`#E0E0E0`) | 3px Black | Bottom (440px) | Subtle podcasts & calm talks |
| **Boxed Punch** | Montserrat Black | Lime Green (`#00FF66`) | Black Box Backing | Bottom (440px) | Maximum readability over complex backgrounds |
| **Hindi Devanagari** | Noto Sans Devanagari | Saffron (`#FFA500`) | 6px Black | Bottom (440px) | Hindi & Hinglish YouTube videos |

---

## 📄 License
Personal Use License.

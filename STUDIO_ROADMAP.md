# EMS Studio — Roadmap

What's shipped, what's next, and the strategic argument behind each.

---

## ✅ Shipped today

### Wave 1 — The marketplace flywheel
- **Loop Browser** (`/api/stems/search`, `StemLoopBrowser`) — every track on EMS with stems generated is a draggable loop in the DAW. Each load records a `StemUsage` row; the source artist gets 2% of the derived track's revenue when it earns. Replaces Splice's $13/mo subscription with a royalty-paying model that compounds.
- **License-aware Quick Upload** — checkbox defaulting ON: "Also publish stems to the Loop Browser." On publish, kicks off Demucs separation in the background so every new release auto-joins the loop library.
- **DB**: `StemUsage` model + `StemKind` enum + migration `20260525000000_stem_usage`.

### Wave 2 — Pro-feel parity
- **AI Mastering** (`/api/mastering/render` + `/api/mastering/status`) — matchering on Replicate, target -14 LUFS streaming default. "✨ AI Master" button on the DAW Master/Publish bar bounces → uploads → masters → loads result back as a "Master (AI)" track for A/B against the raw mix.
- **Free Sample Library** (`SampleLibraryPanel`) — 20-sample CC0 manifest (drums/bass/melody/fx/vocals) rendered next to the Loop Browser. Zero royalty, zero subscription. Sample audio files dropped under `/public/samples/`.

### Wave 3 — The social moat
- **Open Studio Sessions** (`OpenStudioSessionsPanel`) — floating fixed-position launcher inside the DAW. Toggles a right-side drawer with live chat for visiting fans. Visitor count derived from the existing collaborator-presence channel. Chat is Supabase Realtime broadcast (no DB).
- **Become a Co-Writer CTA** (`/api/songs/[id]/cowriter`, `CoWriterCta`) — fans tap "Buy a writer's share" on `/track/[id]`. Four preset shares (0.25%/0.5%/1%/2%) with optional message. Captures intent as `CoWriterInterest`; artist accepts/declines on dashboard; Stripe checkout for the actual share purchase is a follow-up flow.

---

## 🚧 Tier 0 — Pro-feel gaps still missing (~2 weeks)

These are what users notice within 30 seconds of opening EMS Studio after using FL/Ableton/Logic. The "is this a toy or a DAW?" filter.

| Feature | Why critical | Estimated effort |
|---|---|---|
| **Time-stretch + warping** | Change track tempo without re-recording. Ableton's killer feature. | 2 days (RubberBand WASM) |
| **Real-time pitch correction** | 2025 reality: every vocal is auto-tuned. Without it vocals sound amateur. | 3 days (open-source pitch model on a Worklet) |
| **Take lanes + comping** | Record N takes, comp the best phrases. Pro Tools' decade-old killer feature. | 3 days |
| **Quantize (audio + MIDI)** | Snap to grid. Users expect this. MIDI clips can be done quickly; audio quantize requires onset detection. | 1d MIDI / 3d audio |
| **Real timeline + clip arrangement** | Drag-resize regions in a timeline view. Pro DAW table stakes. | 4-5 days |
| **Lower latency (Audio Worklets)** | Web Audio defaults are ~512 samples. Pro DAWs run 64-128. | 3 days refactor |

---

## 🚀 Tier 1 — AI features for parity (~2 weeks)

Modern DAWs all race here. We need these to be considered serious.

| Feature | Status | Notes |
|---|---|---|
| **AI Mastering** | ✅ Shipped | matchering on Replicate |
| **AI vocal-tune (smart Auto-Tune)** | Not started | open-source pitch correction on a worklet OR hosted API |
| **AI inspiration (chord/melody/drum generators)** | Not started | Magenta or hosted; "give me a chord progression in Am at 90 BPM" |
| **AI mixing assistant** | Not started | chat-with-mix: "EQ this vocal, my reverb sounds muddy" |
| **Auto-clip generator for socials** | Not started | TikTok/Reels-ready 15s/30s/60s vertical edits with beat-matched cuts. We have FFmpeg infra |

---

## 🏰 Tier 2 — The moat (only EMS can ship)

Features that require the marketplace + social graph + DAW substrate. Spotify can't (no DAW), Logic can't (no social), BandLab can't (no marketplace).

| Feature | Status | Notes |
|---|---|---|
| **Stem Marketplace as Loop Browser** | ✅ Shipped | Replaces Splice |
| **License-aware export** | ✅ Shipped | Auto-publishes stems |
| **Open Studio Sessions** | ✅ Shipped (v1) | Chat broadcast; v2 needs DB persistence + push notifications when artists go live |
| **Fan-as-co-writer split sheets** | ✅ Shipped (v1) | Captures intent; v2 needs Stripe checkout + writer-share token model |
| **License-holder-only DM** | Not started | Buy a license → unlock direct chat with artist forever |
| **Listening room → instant license purchase** | Not started | Hear a track in `/studio/live`, one-tap buy. The room infra exists |
| **Live remix battles (Verzuz with stems)** | Not started | Versus already exists; layer on the stem mechanic |
| **Royalty waterfall predictor** | Not started | "If you sell N licenses at $X, your monthly run rate is $Y" |

---

## 📱 Mobile companion app

You have `apps/mobile`. The killer integration is:

- Phone records a voice memo / guitar idea
- Upload syncs to user's "Sketches" folder via the existing /api/upload pipeline
- Web Studio's left rail shows the new Sketch as a one-click drag onto a track

GarageBand has iCloud, BandLab has cloud, but neither has the marketplace + social loop attached. **Estimated: 1 week** for the mobile recorder + sync, assuming Capacitor app already runs.

---

## ⚠️ Things we DELIBERATELY skipped

| Thing | Why |
|---|---|
| Audio quantize MVP | Requires onset detection — 2-day effort. Doing it half-baked is worse than not having it. |
| BPM detection on uploaded audio | Same — need onset detection. |
| Real-time multiplayer DAW (Y.js/Liveblocks) | The CRDT integration is a 1-week investment. Open Studio Sessions delivers 80% of the perceived value at 5% of the cost. |
| Plugin support (VST3/AU via WASM) | Months of work. Not worth it for a browser DAW until the rest is rock solid. |
| Vocoder, granular synth, pitch shifter UI | These are deep features. Build them when 100k MAU need them, not before. |

---

## How to demo this for the lawyer (60-second narrative)

1. Open `/studio` — show the public landing ("Make a track. Sell it. Keep 100%.").
2. Sign in → land on `/studio/board` (the DAW).
3. Show the **Sample Library** + **Loop Browser** side by side. Click a few stems — they load as colored tracks. Point out: "Every stem here pays the original artist 2% of my future revenue. That's the whole flywheel."
4. Hit **✨ AI Master** — ~60s wait. Returns as a new "Master (AI)" track. A/B with the raw mix.
5. Open **Open Session** drawer (bottom-right pill). "Fans can drop in here while I'm working. None of my competitors can ship this."
6. Click **Publish to catalog** → land on Quick Upload Step 1 with the audio prefilled. Set price. Tick "Also publish stems to Loop Browser." Hit Publish.
7. Open the published track at `/track/[id]`. Show the **Become a Co-Writer** card. "Fans can buy a 0.5% writer's share for $50. The license-share economics are already in place — this is just the next layer."

That's the whole story. Three economic flywheels stacked: license sales, stem royalties, co-writer shares.

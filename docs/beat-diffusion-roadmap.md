# Beat-AI: from embeddings to a custom diffusion model

This is the path from "we have a pgvector index of every beat" (shipped today) to "we have a Suno-grade custom diffusion model that generates beats users would actually use" (the destination).

## Where we are now (Phase 0 — shipped)

- `BeatEmbedding` table in Postgres, pgvector(384) column with an IVFFlat cosine index.
- An hourly cron (`/api/cron/beat-embeddings`) walks every active, non-draft `Song` whose artist has a recent `StudioProject` with a beat pattern. Builds a textual descriptor (`trap @ 142 BPM · kick on 1,9 · snare on 5,13 · ...`), runs it through OpenAI `text-embedding-3-small`, compresses to 384 dims, upserts.
- An anonymous-OK suggestion endpoint (`POST /api/beat-ai/suggest`) embeds the user's current pattern and returns the K nearest published beats. Studio surfaces them as "producers in your genre at this BPM also hit kick on step 11."

This already does most of what a producer wants — *learn from the corpus, suggest moves that work.* No GPU bill.

## Phase 1 — Richer signals (1-2 sprints, cheap)

The current embedding is text-from-pattern. The corpus has a lot more we're not feeding it yet:

- **Audio embeddings**: render each beat to 8s of WAV, push through `microsoft/MERT-v1-330M` (Apache 2.0) or CLAP. ~768-dim audio vector. Concatenate with the pattern embedding for a 384+384 multi-modal vector (we'd add a `BeatEmbedding.audioEmbedding vector(384)` column).
- **Outcome-weighted retrieval**: today every beat in the index has equal weight. Weight by `streamCount`, `soldLicenses`, `aiScore`, so suggestions skew toward beats that actually performed.
- **Negative examples**: skipped previews, downvoted suggestions. Train a re-ranker on (query, positive, negative) triples — this is a lightweight LightGBM head on top of the embeddings, not a model retrain.

**Cost to ship Phase 1**: ~2 weeks of engineering, ~$200/mo additional inference. No GPU training.

## Phase 2 — Symbolic generation (medium lift)

Before training audio diffusion, train a small transformer to generate *symbolic patterns* (the 16-step boolean grid + a kit choice). The corpus we have — every saved pattern in `StudioProject.patternJson` — is the dataset. Tokenize each beat as `<genre> <bpm> <kit> [lane:step] [lane:step] ...`.

- **Model**: ~50M-parameter decoder-only transformer (think GPT-2 small). Trained from scratch on the EMS pattern corpus.
- **Training infra**: 1 × A100 80GB on Modal/Lambda Labs. With ~50k patterns of training data, one epoch takes ~2 hours. Three epochs to convergence.
- **Cost**: ~$300 for training, ~$50/mo for hosted inference (single GPU, serverless).
- **What this unlocks**: "complete this beat in trap style" — the model writes the next 8 bars based on what's already there. Same skeleton as Suno's pattern model but symbolic, not audio.

We need ~10k unique patterns in the corpus before Phase 2 training is worth it. Track progress on `/admin/ai` (the coverage bar).

## Phase 3 — Audio diffusion (months, real GPU budget)

This is the "Suno-grade" payoff. Train a diffusion model on the actual audio of EMS beats.

- **Architecture**: AudioLDM2-style — text-conditioned latent diffusion over a VAE-encoded mel-spectrogram representation. Train the VAE first on EMS audio (1-2 weeks, 4 × A100), then the diffusion transformer on top (4-8 weeks, 8 × A100).
- **Dataset**: every published track's master bounce + its descriptor (genre, BPM, kit, mood tags). Realistically 10k+ tracks for a model that doesn't badly overfit.
- **Cost**: ~$30k-$80k for training infra over 2-3 months. ~$2-5k/mo for serving at scale (one beat / 4s of audio per request, batched).
- **License**: trained on EMS user-uploaded music, so ToS needs an "we may use your uploads to train models" clause + an opt-out. Worth lawyer time.
- **Quality bar**: at minimum, generate a 16-bar beat that sits in tempo, doesn't have glaring artifacts, and matches the requested genre. Suno is the north star; matching them costs Suno-money.

## What stays the same across phases

- The `BeatEmbedding` table. Phase 1 adds a column; Phase 2 generation reads patterns out and writes new ones back; Phase 3 stores the audio-encoder vector alongside.
- The `/api/beat-ai/suggest` endpoint signature. Internal swap from "nearest neighbor" → "generation" is a config flag, not a refactor.
- The studio's UI surface. Suggestions land via the same component whether they came from the corpus or a generative model.

## What to do today

The data foundation is what gets us there. Every beat that lands in `BeatEmbedding` today is a training example tomorrow. Don't fast-forward Phase 2 or 3 — first run Phase 0 (live now) for ~3 months, fix issues in the descriptor + retrieval, and grow the corpus.

Then revisit, talk to a vendor (Replicate / Modal / RunPod) about Phase 2 training infra, and we go.

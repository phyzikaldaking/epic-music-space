# 🚀 Epic Music Space

An immersive, space-themed music discovery and player web application built with Next.js 14.

![Epic Music Space](https://picsum.photos/seed/epicmusic/1200/400)

## ✨ Features

- **🎵 Persistent Music Player** — Play/pause, skip, seek, volume, shuffle, repeat
- **🌌 Space Visual Theme** — Dark cosmic backgrounds, animated starfield, nebula gradients
- **🔍 Search** — Search across tracks, artists, and albums
- **📚 Library** — Create and manage playlists
- **❤️ Liked Songs** — Save your favorites
- **👨‍🎤 Artist & Album Pages** — Detailed artist bios, discographies, and album track lists
- **📊 Audio Visualizer** — Canvas-based frequency bar visualizer
- **📱 Responsive** — Works on mobile, tablet, and desktop

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with custom space theme
- **State**: Zustand (with localStorage persistence)
- **Audio**: HTML5 Audio API + Web Audio API
- **UI Primitives**: Radix UI
- **Icons**: Lucide React
- **Testing**: Jest + React Testing Library

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/phyzikaldaking/epic-music-space
cd epic-music-space
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm run start
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Home/Discover
│   ├── search/             # Search page
│   ├── artist/[id]/        # Artist detail
│   ├── album/[id]/         # Album detail
│   ├── library/            # Your playlists
│   ├── playlist/[id]/      # Playlist detail
│   ├── liked/              # Liked songs
│   └── profile/            # User profile
├── components/
│   ├── layout/             # Sidebar, PlayerBar, MainLayout
│   ├── player/             # AudioVisualizer
│   └── ui/                 # Button, Card, Badge, Modal, Skeleton, etc.
├── data/                   # Mock music data (21 tracks, 8 artists, 6 albums)
├── hooks/                  # useAudioPlayer
├── lib/                    # API functions, utilities
├── store/                  # Zustand stores (player, playlists)
└── types/                  # TypeScript interfaces
```

## 🔧 Environment Variables

See [`.env.local.example`](.env.local.example) for configuration.

The app runs fully on **mock data** with no API keys required.

## 🚢 Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Vercel deployment instructions.

## 🎨 Color Palette

| Token | Color | Usage |
|-------|-------|-------|
| Space Dark | `#0a0a1a` | Main background |
| Nebula Purple | `#6b21a8` | Primary accent |
| Nebula Blue | `#1d4ed8` | Secondary accent |
| Cosmic Pink | `#ec4899` | Like/favorite |
| Aurora Green | `#10b981` | Success states |

## 📜 License

MIT

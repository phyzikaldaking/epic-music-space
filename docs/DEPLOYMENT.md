# Deploying Epic Music Space

## Deploy to Vercel (Recommended)

### 1. Fork & Connect

1. Fork this repository to your GitHub account
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click **Add New → Project**
4. Import your forked repository

### 2. Configure Environment Variables

In the Vercel dashboard under **Settings → Environment Variables**, add:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXTAUTH_URL` | Your Vercel deployment URL (e.g. `https://epic-music.vercel.app`) | Yes |
| `NEXTAUTH_SECRET` | Random secret (`openssl rand -base64 32`) | Yes |
| `SPOTIFY_CLIENT_ID` | From Spotify Developer Dashboard | No |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard | No |

### 3. Deploy

Click **Deploy**. Vercel will automatically build and deploy your app.

---

## Setting Up Spotify API (Optional)

The app works with mock data by default. To use real Spotify data:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set the **Redirect URI** to `https://your-domain.vercel.app/api/auth/callback/spotify`
4. Copy the **Client ID** and **Client Secret** to your environment variables
5. Update `src/lib/auth.ts` to use the Spotify provider

---

## Custom Domain

In Vercel: **Settings → Domains → Add Domain**

---

## Local Development

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

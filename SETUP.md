# Hospitality Ad Studio — Setup & Deployment Guide

A step-by-step guide from zero to live deployment on Vercel.

---

## Prerequisites

- Node.js 18+ installed
- A GitHub account
- A Vercel account (free tier works)
- A Supabase account (free tier works)
- API keys for: Anthropic, fal.ai, Google Maps

---

## PART 1 — Local Development

### Step 1: Install dependencies

```bash
cd hospitality-ad-studio
npm install
```

### Step 2: Set up environment variables

Copy the example file:
```bash
cp .env.example .env.local
```

Then fill in all values in `.env.local` (see Part 2 below for how to get each key).

### Step 3: Run the development server

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

---

## PART 2 — Get Your API Keys

### Supabase (Database + Auth + Storage)

1. Go to https://supabase.com → New Project
2. Choose a name, password, and region (pick one close to India for best latency)
3. Wait ~2 minutes for provisioning
4. Go to **Project Settings → API**:
   - Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this secret!

### Anthropic (Claude AI)

1. Go to https://console.anthropic.com → API Keys
2. Create a new key → copy it → `ANTHROPIC_API_KEY`
3. Make sure your account has access to `claude-opus-4-6`

### fal.ai (FLUX Image Generation)

1. Go to https://fal.ai → Dashboard → API Keys
2. Create a key → copy it → `FAL_API_KEY`
3. Add billing if needed (FLUX Pro costs ~$0.05/image)

### Google Maps / Places API

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable these APIs:
   - **Places API**
   - **Maps JavaScript API**
   - **Geocoding API**
   - **Maps Static API**
4. Go to **Credentials → Create Credentials → API Key**
5. Restrict the key to the APIs above + your domain
6. Copy it → `GOOGLE_MAPS_API_KEY`

---

## PART 3 — Supabase Schema Setup

### Step 1: Run the SQL schema

1. Go to your Supabase project → **SQL Editor**
2. Open `supabase/schema.sql` from this project
3. Paste the entire file contents into the editor
4. Click **Run** — you should see "Success"

### Step 2: Verify tables were created

Go to **Table Editor** — you should see:
- `clients`
- `folders`
- `photos`
- `events`
- `posts`
- `api_costs`

### Step 3: Verify storage buckets

Go to **Storage** — you should see:
- `property-photos` (public)
- `generated-images` (public)

If they're missing, create them manually:
1. Click **New Bucket**
2. Name: `property-photos`, toggle Public ON
3. Repeat for `generated-images`

### Step 4: Configure Auth

1. Go to **Authentication → Providers**
2. Make sure **Email** provider is enabled
3. Go to **Authentication → URL Configuration**
4. Set **Site URL** to your production URL (e.g. `https://your-app.vercel.app`)
5. Add to **Redirect URLs**: `https://your-app.vercel.app/**`

For local development, also add: `http://localhost:3000/**`

---

## PART 4 — Instagram Publishing Setup (Optional)

To publish directly to Instagram, you need a Meta Developer account.

### Step 1: Create a Meta App

1. Go to https://developers.facebook.com → My Apps → Create App
2. Choose "Business" type
3. Add the **Instagram Graph API** product

### Step 2: Connect an Instagram Business Account

1. Your Instagram account must be a **Professional/Business** account
2. Connect it to a Facebook Page
3. In your Meta App → Instagram → Basic Display → Add Instagram Testers

### Step 3: Get your Page ID and Access Token

1. In your Meta App → Tools → Graph API Explorer
2. Select your App and Page
3. Generate a **long-lived Page Access Token** (valid 60 days)
4. Find your **Instagram Business Account ID** (this is your Page ID)
5. Enter both into the client profile in the app (Clients → Instagram Publishing section)

---

## PART 5 — Deploy to Vercel

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — Hospitality Ad Studio v2"
git remote add origin https://github.com/YOUR_USERNAME/hospitality-ad-studio.git
git push -u origin main
```

### Step 2: Import to Vercel

1. Go to https://vercel.com → New Project
2. Click **Import Git Repository** → select your repo
3. Framework: **Next.js** (auto-detected)
4. Click **Deploy** — it will fail because env vars are missing. That's fine.

### Step 3: Add Environment Variables

1. Go to your Vercel project → **Settings → Environment Variables**
2. Add ALL variables from `.env.example`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `FAL_API_KEY` | Your fal.ai key |
| `REPLICATE_API_KEY` | Your Replicate key (optional fallback) |
| `GOOGLE_MAPS_API_KEY` | Your Google Maps key |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` |

3. Set environment to **Production**, **Preview**, and **Development**

### Step 4: Redeploy

1. Go to **Deployments** → select the latest → **Redeploy**
2. Wait ~60 seconds
3. Visit your live URL

### Step 5: Update Supabase Auth URLs

1. Go back to Supabase → **Authentication → URL Configuration**
2. Update **Site URL** to your Vercel URL
3. Add your Vercel URL to **Redirect URLs**: `https://your-project.vercel.app/**`

---

## PART 6 — First Run

1. Go to your live URL
2. Click **Sign up** and create an account
3. Check your email to confirm (Supabase sends a confirmation link)
4. Log in
5. Go to **Clients → + New Client**
6. Paste a Google Maps URL of a property → click **Auto-fill**
7. Fill in remaining details → **Create Client**
8. Upload photos in **Photo Repo**
9. Go to **Events → Fetch Events** to pull Auroville calendar
10. Open **Post Studio** → select client + photo → **Generate Image** → **Generate Caption** → **Approve** → **Publish**

---

## Troubleshooting

**"API key not set" errors**
→ Verify your env vars in Vercel Settings. Remember to redeploy after adding them.

**Image upload failing**
→ Check your Supabase storage bucket is set to Public, and RLS policies are applied correctly.

**Google Maps auto-fill not working**
→ Make sure Places API, Geocoding API, and Maps Static API are all enabled in Google Cloud Console.

**Instagram publish failing**
→ Make sure your token is a long-lived token (not a short-lived one), your Instagram account is a Business/Creator account, and it's connected to a Facebook Page.

**Events fetch failing**
→ The Auroville News & Notes PDF URL may change. Check `src/app/api/events/fetch/route.ts` and update the `AUROVILLE_NEWS_URL` constant if needed.

**Build errors on Vercel**
→ Run `npm run typecheck` and `npm run lint` locally first to catch issues.

---

## Cost Estimates

| Action | Approximate Cost |
|---|---|
| Generate 1 ad image | ~$0.05 (FLUX Pro via fal.ai) |
| Generate caption | ~$0.01 (Claude) |
| Analyse Google Reviews | ~$0.02–0.05 (Claude, depends on review count) |
| Extract events from PDF | ~$0.05–0.10 (Claude, PDF is large) |
| Google Maps place lookup | ~$0.017 per request |

Expected total per published post: **$0.06–0.10**

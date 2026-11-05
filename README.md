# Waveform Studio — AI Music Generator

Generate original songs from a short description or your own lyrics, powered by [SunoAPI.org](https://docs.sunoapi.org/). Built as a static site plus Netlify Functions, so it deploys to Netlify with no build step.

## Features
- **Simple mode** — describe a song; lyrics are written for you.
- **Custom mode** — title, style tags, your own lyrics, excluded styles, vocal gender, length (10 s–6 min), style adherence, weirdness and variety.
- Instrumental toggle and model picker (V6, V6 Mini, V6 Wild).
- Live progress (queued → writing → preview → done), with a streaming preview as soon as the first take is ready.
- Built-in player, lyrics view and MP3 download. Track history is saved in the browser.
- Remaining SunoAPI credit balance in the header.

## How it works
```
browser ──► /api/generate  ──► POST  /api/v1/generate             (returns taskId)
        ──► /api/status    ──► GET   /api/v1/generate/record-info  (polled every 5 s)
        ──► /api/credits   ──► GET   /api/v1/generate/credit
SunoAPI ──► /api/callback  (required callBackUrl; acknowledged only, the app polls)
```
The SunoAPI key lives only in the Netlify Functions (`netlify/functions/`); it is never sent to the browser.

## Deploy on Netlify
1. In Netlify, **Add new site → Import an existing project** and pick this repo / `main` branch. `netlify.toml` already sets the publish folder (`public`) and functions folder, so leave the build command empty.
2. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY` = your SunoAPI.org key
   - *(optional)* `SUNO_API_BASE` to force an API host (defaults to `https://api.sunoapi.org`, falling back to `https://apibox.erweima.ai`).
3. Trigger a redeploy so the functions pick up the variable.

## Run locally
```bash
npm i -g netlify-cli
cp .env.example .env   # then put your key in .env
netlify dev
```

## Project layout
```
public/                  static frontend (index.html, styles.css, app.js)
netlify/functions/       serverless API proxy (generate, status, credits, callback)
netlify.toml             Netlify config
```

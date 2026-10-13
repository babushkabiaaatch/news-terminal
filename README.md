# News Terminal (free, 24/7, installable on Android)

Your PC can be off. Architecture:

    Android (installed web app / PWA)  ->  Cloudflare Worker (free)  ->  RSS feeds
    The page + app files are served by the same Worker.  Code lives on GitHub.

## Deploy (about 10 minutes)

1. **GitHub**: create a new repo and upload everything in this folder
   (github.com -> New repository -> "uploading an existing file" -> drag the contents in).
2. **Cloudflare**: make a free account at cloudflare.com.
3. In the dashboard open **Workers & Pages -> Create -> Import a repository (Git)**, pick your repo
   and accept the defaults (no build command; deploy command `npx wrangler deploy`).
   Every future `git push` redeploys automatically.
   (Dashboard wording changes now and then; if you can't find it, use the CLI instead:
   install Node.js, run `npx wrangler login`, then `npx wrangler deploy` inside this folder.)
4. You get a URL like `https://news-terminal.<your-name>.workers.dev`. Open it: headlines should appear
   within a few seconds. The line under the search box shows how many feeds are live and which are down.

## Install on Android

Open the URL in **Chrome** -> menu (three dots) -> **Install app** (or **Add to Home screen**).
It then opens full-screen like a normal app, with its own icon.

## Customise

Edit the `FEEDS` list at the top of `src/worker.js` (any RSS/Atom URL), commit, and it redeploys.
Change the colours/layout in `public/index.html`.

## Free-tier limits (Cloudflare Workers Free)

100,000 requests/day, 10 ms CPU per request, 50 outbound fetches per request. This app is built around
those limits: the Worker never parses XML (your phone does), so it stays far below them.
Leaving the app open all day uses roughly 10-15k requests/day. It pauses polling when the app is in the background.

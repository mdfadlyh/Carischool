// middleware.js — Vercel Routing Middleware
//
// Added 2026-09-24 to fix a routing bug that predates this file. kawasan.html
// and berdekatan.html are real static files sitting in this repo. On Vercel,
// when a request's path exactly matches a physical static file, the static
// file is served directly -- the request never reaches vercel.json's
// "rewrites" evaluation stage at all, regardless of `has` conditions like a
// User-Agent check. So the bot-only rewrite rules that used to live in
// vercel.json for these two pages (rewriting AI crawlers to
// /api/prerender?type=kawasan|berdekatan&bandar=...) never actually fired --
// confirmed 2026-09-24 via direct curl -A "ClaudeBot" tests against the live
// site: the plain static SPA shell came back regardless of UA or query
// params, while calling /api/prerender directly (bypassing vercel.json)
// returned correct, fully-rendered HTML. The prerender function itself was
// always correct; only the routing TO it was broken. This likely means the
// entire AI-crawler-facing surface for these two pages never worked in
// production, Malay included, since the kawasan.html rule was first added.
//
// (/school/:slug is unaffected by this bug -- no physical file exists at
// that exact path, only at /school.html, so its vercel.json rewrite was
// never shadowed this way and is left as-is.)
//
// Routing Middleware runs BEFORE static file serving (that's the whole
// reason it exists, per Vercel's own docs), so this is the correct fix
// rather than another vercel.json rewrite attempt. The corresponding
// bot-rewrite rules for kawasan.html/berdekatan.html were removed from
// vercel.json in the same change -- they were dead code (unreachable), and
// leaving both in place would just invite drift between two descriptions of
// the same routing decision.
//
// CONTENT PARITY RULE (same as api/prerender.js): this only decides WHICH
// requests get redirected to the prerender function -- it emits no content
// itself. Any change to which bots/params route to prerender here must stay
// in sync with api/prerender.js's own matcher logic.

import { rewrite, next } from '@vercel/functions';

// M31: enumerate all three agent families per vendor (training / indexing /
// user-triggered) -- same list as api/prerender.js and the pre-existing
// vercel.json rules, kept identical on purpose.
const BOT_UA = /(OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|ClaudeBot|Claude-User|Claude-SearchBot)/;

export const config = {
  matcher: ['/kawasan.html', '/berdekatan.html'],
};

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return next();

  const url = new URL(request.url);
  const bandar = url.searchParams.get('bandar');
  if (!bandar) return next();

  const target = new URL('/api/prerender', url);
  target.searchParams.set('bandar', bandar);

  if (url.pathname === '/kawasan.html') {
    target.searchParams.set('type', 'kawasan');
  } else if (url.pathname === '/berdekatan.html') {
    target.searchParams.set('type', 'berdekatan');
    // English branch, added 2026-09-24 -- see api/prerender.js renderBerdekatan().
    // kawasan.html has no English branch in prerender.js yet, so lang is
    // deliberately not read/forwarded for that path.
    const lang = url.searchParams.get('lang');
    if (lang === 'en') target.searchParams.set('lang', 'en');
  } else {
    return next();
  }

  return rewrite(target);
}

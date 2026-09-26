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
// /school/:slug was added here on the same date for a DIFFERENT reason.
// It was never shadowed by the static-file bug above (no physical file sits
// at that exact path, only at /school.html), and its vercel.json bot rule
// did fire -- confirmed live, ClaudeBot got real prerendered school content,
// not the SPA shell. But the same live test showed `?lang=en` on the request
// was silently dropped: the response came back in Malay every time. A plain
// vercel.json "destination" rewrite does not reliably forward query params
// it doesn't itself reference in the destination string, and this was never
// going to be caught by anything short of a live request -- exactly the
// class of bug M70 is about (never trust an unverified condition-gated
// rewrite). Rather than patch vercel.json a second way and carry two
// different rewrite mechanisms for the same three prerender routes, this
// route was folded into middleware.js too, which already forwards lang=en
// explicitly and is proven working for kawasan/berdekatan. The corresponding
// bot-rewrite rule for /school/:slug was removed from vercel.json in the
// same change; the plain (non-bot) /school/:slug -> /school.html rewrite for
// human visitors stays there untouched.
//
// Routing Middleware runs BEFORE static file serving (that's the whole
// reason it exists, per Vercel's own docs), so this is the correct fix
// rather than another vercel.json rewrite attempt.
//
// CONTENT PARITY RULE (same as api/prerender.js): this only decides WHICH
// requests get redirected to the prerender function -- it emits no content
// itself. Any change to which bots/params route to prerender here must stay
// in sync with api/prerender.js's own matcher logic.

import { rewrite, next } from '@vercel/functions';

// M31: enumerate all three agent families per vendor (training / indexing /
// user-triggered) -- same list as api/prerender.js's own comments and the
// pre-existing vercel.json rules, kept identical on purpose.
//
// Bing/msnbot tokens added 2026-09-26, prompted by Bing Webmaster Tools'
// SEO Analysis report surfacing this as a real gap: Bingbot -- like every
// other non-Googlebot crawler this file exists for -- does not reliably
// execute JS, so it was hitting the plain client-rendered SPA shell on
// kawasan.html/berdekatan.html/school/:slug the same way OAI-SearchBot did
// before M70/M71 fixed routing for those. `bingbot` is Bing's indexing
// crawler (the M31 "indexing" family member); `BingPreview` is Bing's
// link-preview/snippet fetcher (the "user-triggered" family member, same
// role as ChatGPT-User/Perplexity-User); `msnbot` is Bing's legacy token,
// still seen live from Microsoft's crawler infrastructure alongside
// `bingbot`, kept for the same enumerate-every-known-token reason Perplexity
// and OpenAI each get more than one entry here. Bing has no separate public
// "training" crawler token the way GPTBot/CCBot are for OpenAI/Common Crawl
// (per M31's three-family framing) -- only these two/three are documented.
const BOT_UA = /(OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|ClaudeBot|Claude-User|Claude-SearchBot|bingbot|BingPreview|msnbot)/i;

export const config = {
  matcher: ['/kawasan.html', '/berdekatan.html', '/school/:slug'],
};

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return next();

  const url = new URL(request.url);
  const target = new URL('/api/prerender', url);

  if (url.pathname === '/kawasan.html' || url.pathname === '/berdekatan.html') {
    const bandar = url.searchParams.get('bandar');
    if (!bandar) return next();
    target.searchParams.set('bandar', bandar);
    target.searchParams.set('type', url.pathname === '/kawasan.html' ? 'kawasan' : 'berdekatan');
  } else if (url.pathname.startsWith('/school/')) {
    const slug = url.pathname.slice('/school/'.length);
    if (!slug) return next();
    target.searchParams.set('slug', slug);
    target.searchParams.set('type', 'school');
  } else {
    return next();
  }

  // English branch, added 2026-09-24 -- see api/prerender.js renderKawasan(),
  // renderBerdekatan() and renderSchool(). All three routes support it.
  const lang = url.searchParams.get('lang');
  if (lang === 'en') target.searchParams.set('lang', 'en');

  return rewrite(target);
}

// /api/oembed-reel.js
//
// Proxies oEmbed requests for Instagram Reels, TikTok videos, and Facebook
// Reels/videos, used by school.html's "🎬 Reel/Cerita Terkini" section
// (Premium schools only -- see kemaskini.html's reel_url field). Server-side
// proxy rather than a direct client-side fetch for two reasons: (1) Meta's
// Graph API does not set permissive CORS headers for arbitrary origins, so
// a browser fetch straight to graph.facebook.com would fail; (2) keeps
// platform-detection and all providers' endpoint specifics in one place, so
// a future change to any provider's API only needs updating here, not in
// school.html.
//
// Sourcing, verified via web search 2026-08-26 (not assumed from training
// data, which would have said the opposite for Instagram/Facebook):
//   - Instagram: graph.facebook.com's oEmbed API required an access token
//     and App Review from October 2020 until Meta reversed that policy on
//     2026-06-15 -- public content (posts /p/, reels /reel/, IGTV /tv/) is
//     now tokenless.
//   - Facebook: same 2026-06-15 policy change explicitly covers Facebook
//     too (confirmed directly from Meta's own developer-blog announcement,
//     not just a secondary source). Two separate endpoints: `oembed_post`
//     for regular posts, `oembed_video` for video/Reel content (Facebook
//     Reel URLs are facebook.com/reel/{id}, handled by oembed_video).
//   - Both Meta endpoints: a token still works and may grant higher rate
//     limits, but none is used here. Re-verify this is still current if
//     this file is revisited long after 2026 -- Meta has changed this
//     policy before (2020 -> tokens required, 2026-06-15 -> reversed) and
//     could again.
//   - TikTok: https://www.tiktok.com/oembed has always been a public,
//     key-free endpoint per TikTok's own developer documentation -- no
//     policy history to re-verify here.
//
// No env vars required -- all calls are genuinely unauthenticated.

// Fixed 2026-09-04 -- confirmed exploitable SSRF: detectPlatform() and the
// two resolveIfShort*Link() functions below used regex.test(url) against
// the RAW url string, with several patterns unanchored (no ^ requiring a
// match at the start). A crafted URL like
// "https://evil-attacker-site.com/x?y=facebook.com/share/v/z" passed both
// the platform check AND the "should we resolve this short link" check,
// purely because the substring "facebook.com/share/v/" appeared somewhere
// in the string -- then the server would fetch() that attacker-controlled
// domain directly. Fix: parse the URL properly with the URL constructor
// and check the actual hostname/pathname, never the raw string.
function safeParseUrl(url) {
  try { return new URL(url); } catch (e) { return null; }
}

// hostname === domain (bare) or a real subdomain of it (www., m., etc) --
// NOT a substring/suffix check like hostname.includes(domain), which would
// let "tiktok.com.evil.com" or "evil-tiktok.com" through.
function hostnameIs(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function detectPlatform(url) {
  const u = safeParseUrl(url);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (hostnameIs(host, 'instagram.com') && /^\/(reel|p|tv)\//i.test(path)) return 'instagram';

  if (hostnameIs(host, 'tiktok.com') && /\/video\//i.test(path)) return 'tiktok';
  // TikTok's mobile-app Share button generates shortened links
  // (vm.tiktok.com/xxx, vt.tiktok.com/xxx, tiktok.com/t/xxx) that redirect
  // to the canonical /@user/video/{id} page -- these have no predictable
  // path structure to extract an id from, so they're detected by host/path
  // alone and resolved to the canonical URL below before calling oEmbed.
  // Confirmed via web search 2026-08-26 this is a widely-hit gap in other
  // TikTok-embedding tools, not something specific to this build.
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return 'tiktok';
  if (hostnameIs(host, 'tiktok.com') && /^\/t\//i.test(path)) return 'tiktok';

  if (hostnameIs(host, 'facebook.com') && /^\/reel\//i.test(path)) return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /\/videos\//i.test(path)) return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /\/posts\//i.test(path)) return 'facebook_post';
  // Facebook's mobile-app Share -> Copy Link button generates shortened
  // links in three shapes, confirmed via web search 2026-08-27:
  //   - fb.watch/xxx (a DIFFERENT domain entirely, contains no
  //     "facebook.com" substring at all)
  //   - facebook.com/share/v/xxx (video)
  //   - facebook.com/share/p/xxx (post)
  // All three redirect to a canonical facebook.com/watch/?v=... or
  // .../posts/... page -- resolved server-side below before calling
  // oEmbed, same reasoning as the TikTok short-link fix above.
  if (host === 'fb.watch') return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /^\/watch\/?$/i.test(path) && u.searchParams.has('v')) return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /^\/share\/v\//i.test(path)) return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /^\/share\/r\//i.test(path)) return 'facebook_video';
  if (hostnameIs(host, 'facebook.com') && /^\/share\/p\//i.test(path)) return 'facebook_post';
  return null;
}

// TikTok's oEmbed endpoint's behavior on shortened links wasn't confirmed
// either way during research -- rather than gamble on it resolving them
// internally, this resolves server-side first so the oEmbed call always
// receives a canonical URL regardless of TikTok's internal handling.
//
// A real browser User-Agent is included deliberately (added 2026-08-27) --
// confirmed via a real test that tiktok.com/embed.js loads fine when a
// person visits it directly in Safari, but this server-side fetch (no
// User-Agent by default, which reads as an obvious non-browser request)
// was suspected of being treated differently by TikTok's servers, causing
// silent resolution/oEmbed failures that never happen for a real visitor.
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function resolveIfShortTikTokLink(url) {
  const u = safeParseUrl(url);
  if (!u) return url;
  const host = u.hostname.toLowerCase();
  const isShort = host === 'vm.tiktok.com' || host === 'vt.tiktok.com'
    || (hostnameIs(host, 'tiktok.com') && /^\/t\//i.test(u.pathname));
  if (!isShort) return url;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': BROWSER_UA } });
    return res.url || url; // fetch() follows redirects by default; .url is the final landing URL
  } catch (e) {
    return url; // fall back to the original -- let the oEmbed call fail cleanly if it must
  }
}

// Same resolution strategy as TikTok's, for fb.watch and share/v|p/ links.
// facebook.com/watch/?v=... is ALREADY canonical (confirmed as the
// redirect target of fb.watch, not itself a short link) so it's
// deliberately NOT matched here -- passed straight through to oEmbed.
async function resolveIfShortFacebookLink(url) {
  const u = safeParseUrl(url);
  if (!u) return url;
  const host = u.hostname.toLowerCase();
  const isShort = host === 'fb.watch'
    || (hostnameIs(host, 'facebook.com') && /^\/share\/(v|r|p)\//i.test(u.pathname));
  if (!isShort) return url;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.url || url;
  } catch (e) {
    return url;
  }
}

export default async function handler(req, res) {
  let url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ error: 'URL must be an Instagram Reel/post, TikTok video, or Facebook Reel/post/video link' });
  }

  if (platform === 'tiktok') {
    url = await resolveIfShortTikTokLink(url);
  } else if (platform === 'facebook_video' || platform === 'facebook_post') {
    url = await resolveIfShortFacebookLink(url);
  }

  const ENDPOINTS = {
    instagram: `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(url)}`,
    tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    facebook_video: `https://graph.facebook.com/v21.0/oembed_video?url=${encodeURIComponent(url)}`,
    facebook_post: `https://graph.facebook.com/v21.0/oembed_post?url=${encodeURIComponent(url)}`,
  };

  try {
    // User-Agent only added for TikTok's call -- Instagram/Facebook are
    // confirmed working via Meta's Graph API as-is, no reason to touch a
    // working code path. See BROWSER_UA's definition above for why TikTok
    // specifically needs this.
    const fetchOpts = platform === 'tiktok' ? { headers: { 'User-Agent': BROWSER_UA } } : undefined;
    const oembedRes = await fetch(ENDPOINTS[platform], fetchOpts);
    if (!oembedRes.ok) {
      // Common causes: private/deleted content, malformed URL, or (for
      // Instagram) a provider-side policy change reintroducing a token
      // requirement -- surfaced as a clean 4xx/5xx, not a crash, so
      // school.html can hide the section gracefully either way. Includes
      // the resolved URL and the provider's own error body (added
      // 2026-08-27) -- a bare status code wasn't enough to diagnose a real
      // TikTok failure; this can be checked directly by visiting this
      // endpoint's URL in a browser without needing server log access.
      const errBody = await oembedRes.text().catch(() => '');
      console.error(`${platform} oEmbed failed: status=${oembedRes.status} resolvedUrl=${url} body=${errBody.slice(0, 300)}`);
      return res.status(502).json({ error: `${platform} oEmbed request failed`, status: oembedRes.status, resolvedUrl: url, providerError: errBody.slice(0, 300) });
    }

    const data = await oembedRes.json();
    // Client only needs to know which platform's embed.js script to load --
    // facebook_video vs facebook_post was only relevant for picking the
    // right Graph API endpoint above, both use the same Facebook SDK script.
    const clientPlatform = platform.startsWith('facebook') ? 'facebook' : platform;

    // TikTok is rendered as a static fallback card, not the interactive
    // embed.js widget (added 2026-08-27) -- confirmed via a real device
    // test that tiktok.com/embed.js loads successfully standalone (rules
    // out network blocking) but still failed to hydrate the blockquote in
    // real use, and TikTok publishes no confirmed manual re-process API
    // the way Instagram (instgrm.Embeds.process()) and Facebook
    // (FB.XFBML.parse()) do -- likely an event-timing mismatch between
    // when the script expects to scan the page and when this app actually
    // injects the blockquote (after an async fetch, well after initial
    // page-load events have already fired). A static card built from the
    // oEmbed response's own metadata fields (title/author_name/
    // thumbnail_url -- part of the standard oEmbed video-type spec, not
    // TikTok-specific) can't have this failure mode at all, at the cost of
    // playing outside the page instead of inline.
    if (clientPlatform === 'tiktok') {
      return res.status(200).json({
        platform: 'tiktok',
        fallback: true,
        title: data.title || '',
        authorName: data.author_name || '',
        thumbnailUrl: data.thumbnail_url || null,
        url,
      });
    }

    return res.status(200).json({ platform: clientPlatform, html: data.html });
  } catch (e) {
    console.error('oembed-reel error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}

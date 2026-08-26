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

function detectPlatform(url) {
  if (/instagram\.com\/(reel|p|tv)\//i.test(url)) return 'instagram';
  if (/tiktok\.com\/.+\/video\//i.test(url)) return 'tiktok';
  // TikTok's mobile-app Share button generates shortened links
  // (vm.tiktok.com/xxx, vt.tiktok.com/xxx, tiktok.com/t/xxx) that redirect
  // to the canonical /@user/video/{id} page -- these have no predictable
  // path structure to extract an id from, so they're detected by host/path
  // alone and resolved to the canonical URL below before calling oEmbed.
  // Confirmed via web search 2026-08-26 this is a widely-hit gap in other
  // TikTok-embedding tools, not something specific to this build.
  if (/vm\.tiktok\.com\/|vt\.tiktok\.com\/|tiktok\.com\/t\//i.test(url)) return 'tiktok';
  if (/facebook\.com\/reel\//i.test(url)) return 'facebook_video';
  if (/facebook\.com\/.+\/videos\//i.test(url)) return 'facebook_video';
  if (/facebook\.com\/.+\/posts\//i.test(url)) return 'facebook_post';
  // Facebook's mobile-app Share -> Copy Link button generates shortened
  // links in three shapes, confirmed via web search 2026-08-27:
  //   - fb.watch/xxx (a DIFFERENT domain entirely, contains no
  //     "facebook.com" substring at all)
  //   - facebook.com/share/v/xxx (video)
  //   - facebook.com/share/p/xxx (post)
  // All three redirect to a canonical facebook.com/watch/?v=... or
  // .../posts/... page -- resolved server-side below before calling
  // oEmbed, same reasoning as the TikTok short-link fix above.
  if (/^https?:\/\/fb\.watch\//i.test(url)) return 'facebook_video';
  if (/facebook\.com\/watch\/?\?v=/i.test(url)) return 'facebook_video';
  if (/facebook\.com\/share\/v\//i.test(url)) return 'facebook_video';
  if (/facebook\.com\/share\/r\//i.test(url)) return 'facebook_video';
  if (/facebook\.com\/share\/p\//i.test(url)) return 'facebook_post';
  return null;
}

// TikTok's oEmbed endpoint's behavior on shortened links wasn't confirmed
// either way during research -- rather than gamble on it resolving them
// internally, this resolves server-side first so the oEmbed call always
// receives a canonical URL regardless of TikTok's internal handling.
async function resolveIfShortTikTokLink(url) {
  if (!/vm\.tiktok\.com\/|vt\.tiktok\.com\/|tiktok\.com\/t\//i.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: 'follow' });
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
  if (!/^https?:\/\/fb\.watch\/|facebook\.com\/share\/(v|r|p)\//i.test(url)) return url;
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
    const oembedRes = await fetch(ENDPOINTS[platform]);
    if (!oembedRes.ok) {
      // Common causes: private/deleted content, malformed URL, or (for
      // Instagram) a provider-side policy change reintroducing a token
      // requirement -- surfaced as a clean 4xx/5xx, not a crash, so
      // school.html can hide the section gracefully either way.
      return res.status(502).json({ error: `${platform} oEmbed request failed`, status: oembedRes.status });
    }

    const data = await oembedRes.json();
    // Client only needs to know which platform's embed.js script to load --
    // facebook_video vs facebook_post was only relevant for picking the
    // right Graph API endpoint above, both use the same Facebook SDK script.
    const clientPlatform = platform.startsWith('facebook') ? 'facebook' : platform;
    return res.status(200).json({ platform: clientPlatform, html: data.html });
  } catch (e) {
    console.error('oembed-reel error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}

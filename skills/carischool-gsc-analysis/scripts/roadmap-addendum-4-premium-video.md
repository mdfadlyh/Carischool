## §6 (new) — Premium "Campus Tour" Video (60–90s cut), parked pending Premium launch

Proposed 2026-07-20, follow-on from the 30s cinematic profile teaser prototype
(see Path B pipeline built same session: Python/PIL frame renderer + FluidSynth
original score, no licensed/stock footage, fictional demo school "Tadika
Bintang Kecil"). That 30s version is DONE and live on the homepage
(`carischools.com`, standalone section above "Artikel untuk Ibu Bapa") as a
schools-facing soft pitch + parent-facing showcase.

**What this is:** a longer (60-90s) sibling cut, explicitly a SEPARATE asset
from the on-profile teaser, not a replacement or extension of it.

**Why separate, not just "make the profile video longer":** the on-profile
30s teaser exists specifically to fight the 39-second average engagement-time
problem -- a longer video there works against that goal (lower completion
rate, less replayability). The 60-90s cut is meant for a different job: a
downloadable/shareable asset a claimed Premium school can post to their own
Facebook/Instagram, where longer-form "campus tour" content is normal and
expected. Two assets, two jobs -- don't conflate them later.

**Trigger to build this for real:** Premium sales actually opening/ramping up
(Fadly's own phrasing: "when premium open and sell like hot cake"). Not
gated behind a hard number the way §5's quiz is -- more of a "worth having
ready in the toolkit before the sales conversation happens" item. Reasonable
to prototype once, with the fictional demo school, before real demand hits,
so it's not being built from scratch mid-sales-conversation.

**Shot list needed (fictional demo school, same consistency rules as the 30s
version: same style language, daylight, empty rooms, no children's
faces/hands):**
- Reused from 30s teaser: exterior/entrance, classroom, playground (3 photos)
- New photos: reception/entrance interior, reading corner, nap/rest area,
  arts & crafts corner, dining area, learning-materials close-up, corridor
  with children's artwork (7 photos)
- New short video clips (3-6s, looping, ambient motion only -- leaves/plants
  swaying, curtain + light shifting near a window): garden exterior, a
  classroom window (2 clips)
- Total: ~12 assets for a 60-90s cut without repeating any shot too often

**Technical status, honestly logged:** the 30s pipeline (Python/PIL frame
renderer, Ken Burns pan/zoom, FluidSynth score) only handles STATIC PHOTOS.
Compositing real short video clips into the same pipeline is genuinely
untested -- expected to be achievable via ffmpeg but not proven yet the way
the photo path is. First real attempt at this should be treated as a
prototype step (may take a couple of iterations), not assumed to be a
one-shot success like the photo-only version was.

**Not yet decided / revisit when this gets built:**
- Exact beat structure/storyboard for the extended cut (more locations,
  more narrative pacing than the 30s data-reveal structure -- likely needs
  to feel more like a "walkthrough" than a "stat reveal")
- Whether the extended score needs new musical material or just an extended/
  varied version of the existing composed piece
- Where this asset actually lives once built -- likely a Premium-tier
  deliverable a school downloads/receives, not necessarily hosted publicly
  the way the 30s demo is on the homepage

**Signal condition for Claude to raise unprompted:** when Fadly indicates
Premium sales conversations are actually starting to happen (a real inbound
inquiry, not just planning) -- that's the trigger to revisit and actually
build this, per his own framing.

# Prompt: school-owner trust pass (owner-expectation gaps 1–3)

Paste everything below the line into a fresh session. Attach: index.html, school.html,
claim.html, kemaskini.html, sitemap.js, CLAUDE.md, all carischool skills.
Origin: school-owner persona walk, 2026-07-16. Companion to prompt-school-trust-pass.md
(parents' side); this is the owners' side of the same trust coin.

---

You are working on CariSchool Malaysia. Read CLAUDE.md in full plus the page-builder, i18n,
and data-layer skills before touching anything. They are binding; conflicts stop the work.

## Mission — answer the owner's alarm before selling the owner the benefits

A school owner's discovery sequence is: alarm ("who made a page about MY school?") →
audit ("the phone number is wrong") → money-skepticism ("free until when?") → only then
marketing interest. Today the site answers none of the first three. This pass ships the
legitimacy answer, a lightweight correction path, and a post-claim share kit — turning
every alarmed owner into a claimer, and every claimer into a distributor.

## Standing rules that bind every word of copy

- Sign-off and authorship is ALWAYS "Pasukan CariSchool" / "CariSchool Team". The founder's
  name NEVER appears anywhere — page copy, meta tags, FAQ answers, share texts. No exceptions.
- The "Bukan afiliasi rasmi KPM/JKM" disclaimer must appear on the new page, wording
  identical to its existing usage elsewhere — never weakened.
- No school-count numbers hardcoded anywhere (any language, including meta/OG where
  feasible): fetch counts live from Supabase, per the standing no-static-counts rule.
- No promises beyond current reality: review SLA wording must match the site's canonical
  number (2–5 hari bekerja); "percuma" claims apply to the basic listing only.

## Hard constraints

- House architecture: self-contained pages, no new dependencies, tokens/idioms from the
  page-builder skill, emoji icons.
- Additive only on existing pages; minimal diffs; untouched regions byte-identical.
- New user-visible strings bilingual via `t()` (i18n skill), Malay first — EXCEPT change 3
  (kemaskini.html is Malay-only today; match the page, see change 3).
- `esc()` on all DB-originated strings in new markup; encodeURIComponent for URL params.
- i18n audit script run on every touched bilingual page; output pasted in the report.

## Scoped changes

### 1. untuk-sekolah.html — the owner-facing legitimacy page (new page)

Build from the page-builder skeleton. Indexable (title MS: `Untuk Sekolah — Tuntut Profil
Percuma | CariSchool`), and ADD it to sitemap.js's static list (priority 0.8, monthly) —
include the M20 comment `// update when owner-facing pages change`. Structure and full copy
(EN mirrors; write it faithfully, not creatively):

**Hero** (teal gradient, standard): badge `🏫 Untuk Pemilik & Pengurus Sekolah`;
h1 `Sekolah Anda Sudah <span>Tersenarai</span> di CariSchool`;
sub `Ibu bapa sedang mencari tadika & taska di kawasan anda setiap hari. Profil sekolah anda
sudah wujud — tuntut dan uruskannya, percuma.`

**Section: Kenapa sekolah saya ada di sini?** (card)
`CariSchool menyenaraikan semua tadika berdaftar KPM dan taska berdaftar JKM di Malaysia
berdasarkan maklumat pendaftaran awam. Misi kami mudah: membantu ibu bapa menjumpai sekolah
berdaftar yang sah — termasuk sekolah anda. Penyenaraian asas adalah percuma dan kekal
percuma. {COUNT} sekolah tersenarai setakat ini.` — {COUNT} fetched live (exact-count query,
is_active filter), never hardcoded.

**Section: Apa yang anda boleh buat selepas tuntut profil** (card, emoji list):
`✏️ Kemaskini maklumat — telefon, waktu operasi, yuran` /
`📸 Muat naik foto — perkara #1 yang dicari ibu bapa` /
`💼 Siarkan jawatan kosong — percuma` /
`📊 Lihat berapa ramai ibu bapa melihat & menghubungi anda` /
`📣 Umumkan hari terbuka & pengambilan` (no premium/price mention — the pricing decision
is out of scope for this page).

**Section: Soalan lazim pemilik sekolah** (native `<details>` items):
1. Q `Adakah CariSchool berkaitan dengan KPM atau JKM?` — A: the existing disclaimer
   verbatim + `Kami direktori bebas yang menggunakan data pendaftaran awam.`
2. Q `Berapa kos untuk tuntut profil?` — A `Percuma. Penyenaraian asas dan tuntutan profil
   tidak dikenakan sebarang bayaran, dan akan kekal percuma.`
3. Q `Dari mana maklumat sekolah saya diperoleh?` — A `Daripada senarai pendaftaran awam
   KPM dan JKM. Jika terdapat kesilapan, anda boleh membetulkannya selepas menuntut profil,
   atau laporkan kepada kami.`
4. Q `Berapa lama semakan tuntutan mengambil masa?` — A `2-5 hari bekerja.` (this is the
   canonical SLA; if you find a different number on claim pages/emails, escalate the
   inconsistency — do not pick silently.)
5. Q `Maklumat saya salah tetapi saya belum bersedia untuk menuntut profil. Boleh betulkan?`
   — A: describe the change-2 correction path.
6. Q `Siapa di sebalik CariSchool?` — A `CariSchool diuruskan oleh Pasukan CariSchool,
   sebuah inisiatif bebas untuk membantu ibu bapa Malaysia. Hubungi kami melalui butang di
   bawah.` (No names.)

**Closing CTA** (amber cta-strip): `Tuntut profil sekolah anda — percuma` → /claim.html.

**Link the page from:** (a) index.html footer (one link, MS `Untuk Sekolah`), (b) claim.html
— a small line above the wizard `Baru mengenali CariSchool? Baca kenapa sekolah anda
tersenarai →`. Nothing else; nav stays untouched.

**Deliberately excluded — escalate, don't improvise:** any delisting/removal promise. If
writing FAQ 3/5 seems to require offering removal, stop and present Fadly two wording
options (corrections-only vs corrections+removal-request) with tradeoffs. Removal policy is
a business decision, not copy.

### 2. Provenance + correction line on unclaimed profiles (school.html only)

On profiles where `is_claimed` is false, add one small line (gray, 12px, light box) near the
registration badge:
MS `ℹ️ Maklumat daripada pendaftaran awam KPM/JKM. Anda pihak sekolah? <a>Tuntut profil ini
percuma</a> · <a>Lapor pembetulan</a>` (EN mirror). Claim link → /claim.html?id={id} (the
deep-link auto-select exists). "Lapor pembetulan" v0 is ZERO-schema: reuse the site's
existing contact channel (the Messenger contact pattern) with school context where the
channel supports it. Do NOT create a corrections table or form — that is Phase B, pre-scoped
below for Fadly's approval, not yours.

*Phase B (do not build; include this block verbatim in your report for Fadly):* proposed
`correction_reports` staging table — school_id, field ('phone'|'hours'|'address'|'other'),
suggested_value, reporter_contact (optional), status 'pending', created_at; admin review tab
following the existing queue pattern; reCAPTCHA fail-open as elsewhere. Await approval.

Modal note: this line is profile-only by design (the modal is compact and claim CTAs exist
elsewhere in the flow) — the dual-markup law applies to shared *data displays*, and your
report should state this exclusion explicitly so it reads as a decision, not a miss.

### 3. Share kit in kemaskini.html (post-auth area)

In the authenticated section (visible only after claim-code verification), add a card
`📣 Kongsi profil anda` with: the school's public URL (slug-fallback expression) shown in a
copyable box; buttons `📋 Salin Pautan` (navigator.clipboard + existing toast idiom),
`💬 Kongsi ke WhatsApp` (wa.me/?text= prefill), `📘 Kongsi ke Facebook`
(https://www.facebook.com/sharer/sharer.php?u={encoded url}). Prefilled share text (Malay
only — kemaskini is Malay-only today; note in your report that this section joins the
existing kemaskini-i18n backlog item rather than half-wiring translations for one card):
`{NAME} kini di CariSchool! 🏫 Lihat profil rasmi kami dan hubungi kami terus di sini:
{URL}`. No share-count tracking, no new tables.

## Escalation triggers
- Delisting wording (pre-flagged above). — Correction Phase B schema (pre-flagged).
- Any SLA-number inconsistency found across claim.html / emails / new copy.
- The Messenger contact pattern can't carry school context for change 2's v0 → propose the
  closest zero-schema alternative and wait.

## Done criteria
- [ ] untuk-sekolah.html passes the new-page checklist (CLAUDE.md §4.1) incl. live count,
      disclaimer verbatim, no names, no prices, sitemap entry added with M20 comment.
- [ ] i18n audit clean on untuk-sekolah.html + touched regions of index/claim/school;
      outputs pasted.
- [ ] Provenance line renders ONLY when is_claimed=false; claim deep-link carries the id;
      modal exclusion stated as a decision.
- [ ] Share kit works with keyboard/tap; clipboard fallback doesn't break older browsers
      (try/catch + toast on failure); Malay-only noted against the kemaskini backlog.
- [ ] Phase B proposal block reproduced verbatim in the report; nothing from it built.
- [ ] Minimal diffs; ASSUMED lines listed; learnings note per extract-approach.

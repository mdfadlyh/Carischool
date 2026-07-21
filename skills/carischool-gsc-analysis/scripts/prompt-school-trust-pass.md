# Prompt: school-profile trust pass (parent-expectation gaps 1–4)

Paste everything below the line into a fresh session. Attach: school.html, index.html,
CLAUDE.md, all carischool skills. Goal owner: Fadly. Origin: parent-persona walk, 2026-07-16.

---

You are working on CariSchool Malaysia's school profile experience. Read CLAUDE.md in full
plus the carischool-page-builder, carischool-i18n, and carischool-data-layer skills before
touching anything. They are binding; if this brief conflicts with CLAUDE.md, stop and say so.

## Mission — bridge trust with words while data coverage grows

Parents reaching a profile ask, in order: photos, fees, hours, legitimacy, other parents'
opinions. Fee/photo coverage is low and stays low until claims grow (standing decisions:
crawl paused, premium deferred). This pass converts the three worst dead-ends into actions
and confidence — WITHOUT inventing data, changing queries, or restyling anything.

## Critical structural fact (repeat offender — treat as law)

School information renders in TWO independent markup copies: the full profile in
**school.html** AND the school modal in **index.html**. They are separate implementations.
Changes 1 and 3 below must be applied to BOTH, separately, and your report must show both
diffs. A fix landing in only one file is a failed deliverable (this exact miss has happened
before).

## Hard constraints

- No new dependencies, files, or frameworks. House tokens/idioms only (page-builder skill).
- Additive only: no renaming/removing classes, ids, TRANSLATIONS keys, queries, JSON-LD.
- Every new string bilingual via each page's `t()` system, Malay written first; run the i18n
  audit script on both files and paste output.
- Every DB-originated string in new markup passes through the page's `esc()` helper.
- Fee verification labels are untouchable: where fee data EXISTS, the current display
  ("Disahkan Sekolah" / "Sumber: Laman Web Sekolah") renders exactly as today. Changes below
  fire ONLY in the no-data branch.
- Minimal diffs; untouched regions byte-identical.

## Scoped changes

### 1. Missing-data → action (school.html AND index.html modal)

Where the fee slot currently renders the empty-value state, replace the dead end with an
action block (house style: light box, 12–13px, teal link/button):

- MS: `Yuran belum disahkan oleh sekolah — tanya terus:` + WhatsApp button
  `💬 Tanya Yuran & Kekosongan`
- EN: `Fees not yet verified by the school — ask directly:` + `💬 Ask Fees & Vacancy`

WhatsApp prefill (new fragment keys, both languages; assemble at render time, esc nothing
into the URL — it goes through encodeURIComponent):

- MS: `Salam, saya jumpa {NAME} di CariSchool. Boleh saya tahu yuran bulanan, deposit/yuran
  pendaftaran, dan sama ada masih ada kekosongan? Terima kasih.`
- EN: `Hello, I found {NAME} on CariSchool. May I know the monthly fees, deposit/registration
  charges, and whether places are still available? Thank you.`

Use the existing wa.me idiom (`whatsapp || phone`, digits-only). If the school has neither
number, keep the current empty-value state unchanged — never render a broken button.
Apply the same pattern to the operating-hours slot when empty, with hours-specific wording
(`Waktu operasi belum disahkan — tanya terus` / prefill asks hours + late-pickup). If the
modal's layout makes the hours variant cramped, fees-only in the modal is acceptable —
note the judgment in your report.

### 2. "Soalan penting untuk ditanya" section (school.html only)

A collapsible section (native `<details>` styled to house card idiom — no JS state) placed
after the contact/action area, before related schools. Header:
MS `🗒️ Soalan penting untuk ditanya sebelum mendaftar` /
EN `🗒️ Important questions to ask before enrolling`.
Content: the eight questions below, rendered as a simple list (this is a deliberate
exception to prose-over-bullets — it's a checklist parents will read aloud on calls).
Provide ALL sixteen strings (8×2 languages) as translation keys:

1. MS `Berapa nisbah guru kepada kanak-kanak untuk umur anak saya?`
   EN `What is the teacher-to-child ratio for my child's age group?`
2. MS `Boleh saya dapatkan pecahan penuh yuran — bulanan, deposit, pendaftaran, dan caj lain?`
   EN `Can I get a full fee breakdown — monthly, deposit, registration, and other charges?`
3. MS `Apakah waktu operasi sebenar, dan adakah caj jika lewat menjemput?`
   EN `What are the actual operating hours, and is there a late-pickup charge?`
4. MS `Apakah prosedur jika anak saya sakit, demam, atau berlaku kecemasan?`
   EN `What is the procedure if my child is sick, has a fever, or in an emergency?`
5. MS `Bagaimana kawalan keselamatan semasa penghantaran dan jemputan?`
   EN `How is safety controlled at drop-off and pick-up?`
6. MS `Apakah menu makanan harian dan bagaimana alahan makanan diuruskan?`
   EN `What is the daily food menu and how are food allergies handled?`
7. MS `Boleh saya melawat dan melihat kelas sebelum membuat keputusan?`
   EN `Can I visit and observe a class before deciding?`
8. MS `Apakah kelayakan dan pengalaman guru-guru di sini?`
   EN `What are the qualifications and experience of the teachers here?`

Under the list, one line + link: MS `Baca panduan penuh memilih tadika/taska →` /
EN `Read the full guide to choosing a preschool →` linking to /cara-pilih-tadika.html.

Also: next to the existing registration badge, add a small inline link
MS `Apa maksud pendaftaran ini?` / EN `What does this registration mean?` pointing to the
KPM-vs-JKM explainer guide. CONFIRM the explainer's real filename from the repo/homepage
cards first; if you cannot verify it, escalate rather than guessing a URL.

### 3. Google reviews link (school.html AND index.html modal)

Wherever `google_rating` currently renders, append a link:
MS `Lihat ulasan di Google →` / EN `See reviews on Google →`, href
`https://www.google.com/maps/search/?api=1&query=` + encodeURIComponent(name + ' ' + address),
target `_blank`, styled as the existing small teal text-link idiom. Render ONLY when
google_rating exists (no rating → no link; don't manufacture review expectations).

### 4. Contextual guide strip (school.html only)

A slim strip (existing chip/link idiom, NOT the amber cta-strip — that's reserved for
conversion CTAs) after the questions section: 2 links always —
`📖 Cara Pilih Tadika` → /cara-pilih-tadika.html and
`💰 Panduan Yuran` → /yuran-tadika-malaysia.html — plus, when the school's category is JKM,
`🧸 Panduan Pendaftaran Taska` → /panduan-pendaftaran-taska.html. Bilingual labels.

## Escalation triggers

- The KPM-vs-JKM explainer filename can't be verified → escalate (change 2's badge link only;
  ship the rest).
- Any change requires touching the fee-verification display logic, queries, or JSON-LD.
- The modal genuinely can't host change 1 without restructuring existing DOM that JS targets.

## Done criteria

- [ ] Changes 1 & 3 present in BOTH school.html and index.html; report shows both diffs.
- [ ] Fee/hours action blocks render ONLY in the no-data branch; verified-fee display
      byte-identical to before.
- [ ] No wa.me link rendered for schools with no phone/whatsapp.
- [ ] i18n audit clean on both files, output pasted; all 16 question strings + all labels in
      both maps.
- [ ] `esc()` applied to name/address anywhere they enter new markup (URL params use
      encodeURIComponent, not esc()).
- [ ] `<details>` section works without JS; 360px check on profile and modal.
- [ ] Untouched regions byte-identical; report lists changed regions + why + any ASSUMED
      lines; learnings note per extract-approach.

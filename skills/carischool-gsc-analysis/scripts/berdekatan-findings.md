# Berdekatan review findings — paste-ready routing

Your live CLAUDE.md numbering has moved past my last copy (the page cites M23), so these two
entries use M24/M25 — renumber to your next free slots when pasting into §3.

---

## For CLAUDE.md §3 (named mistakes)

**M24. The flipped language button.** Renders the lang toggle showing the TARGET language
("🇬🇧 EN" while the page is in Malay) on one page while the rest of the site shows the
CURRENT language ("🇲🇾 BM" while in Malay) — two opposite semantics for the same control.
Caught on berdekatan.html; both semantics are defensible in the abstract, which is exactly
why drift happens.
→ **Rule:** The lang button shows the CURRENT language, site-wide:
`langBtn.textContent = currentLang==='ms' ? '🇲🇾 BM' : '🇬🇧 EN'` — and the static HTML
default is `🇲🇾 BM` (matching the Malay default). Majority convention wins over per-page
debate; a control's meaning must not change between pages.

**M25. Shadowing the page globals.** Uses `t`, `db`, `esc`, `currentLang`, or `TRANSLATIONS`
as a local parameter or variable name — e.g. `towns.map(t => ...)`, which silently makes
`t('key')` inside that scope call the array element instead of the translation helper.
Caught on berdekatan.html, where it forced the `lang_schoolWord()` workaround into existence.
→ **Rule:** `t`, `db`, `esc`, `currentLang`, `TRANSLATIONS` are reserved identifiers on
every page; never declare locals with those names. For single-item map/filter params over
data rows, use two-letter names (`tw`, `sc`, `jb`). If a helper-workaround exists only
because of shadowing, the fix is the rename, not another helper.

---

## For learnings-log.md

### 2026-07-17 — Two drift classes only visible when reading a page cold
PROBLEM: berdekatan.html shipped working and well-built, but a cold read against the sibling pages surfaced two silent inconsistencies: the lang button used inverted semantics (target language instead of current), and a map param named `t` shadowed the translation helper, which had already forced a workaround function.
WORKED: Reviewing a new page by diffing its idioms against the majority convention across siblings, not just checking it works in isolation. Fix chosen by majority rule (11+ pages show current language) rather than re-litigating which semantic is "better" — consistency is the feature.
FAILED: The shadowing had already cost something before being caught: `lang_schoolWord()` exists only as a workaround for `t` being unusable inside the map — evidence that shadowing produces compensating complexity, not just risk.
RULE: New-page review must include an idiom diff against sibling pages (controls, helpers, naming), and any "small helper that exists to avoid a naming collision" is a smell pointing at the collision itself.
ROUTED TO: CLAUDE.md M24 + M25 (above); fixed berdekatan.html delivered; carischool-page-builder skill's finishing checklist — add one line: "[ ] Idiom diff vs siblings: lang button semantics, no reserved-name shadowing (t/db/esc)".

---

## Fix applied (berdekatan.html, delivered alongside)

1. Lang button: static default `🇲🇾 BM`; `applyTranslations()` shows current language;
   convention comment added.
2. `renderTowns` map param renamed `t` → `tw` (3 references) with a warning comment.
   `lang_schoolWord()` left as-is (works; minimal diff) — optional cleanup someday: replace
   with a `schoolWord` translation key now that `t()` is usable inside the map.
3. Everything else byte-identical to your uploaded version. `filterTowns()`'s own `t` param
   is inside a scope that never calls the helper, but it was left untouched only because
   the arrow body is a single expression — if you prefer zero exceptions to M25, rename it
   to `tw` there too in the same commit.

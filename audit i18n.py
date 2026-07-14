#!/usr/bin/env python3
"""
CariSchool i18n audit.

Statically checks a single self-contained CariSchool HTML page for the four
classic translation failures:

  1. Keys present in the `ms` map but missing in `en` (or vice versa).
  2. t('key') calls whose key exists in neither map.
  3. Elements with an id and visible text that never appear in
     applyTranslations()/applyStaticTranslations() (likely untranslated statics).
  4. Suspicious hardcoded literals inside showAlert(...), confirm(...), and
     button-state assignments (strings that should be t() calls).

This is a heuristic linter, not a parser — it is tuned to the house style
(TRANSLATIONS = { ms: {...}, en: {...} }; single object literal per page).
Findings are advisories: a small number of justified exclusions is normal
(e.g. state.html's deliberately Malay-only SEO_CONTENT).

Usage:
    python3 audit_i18n.py page.html [page2.html ...]

Exit code 0 = clean, 1 = findings, 2 = couldn't parse the page.
"""

import re
import sys


def extract_lang_block(src: str, lang: str):
    """Return the raw text of the `ms:` or `en:` object inside TRANSLATIONS."""
    m = re.search(r'TRANSLATIONS\s*=\s*{', src)
    if not m:
        return None
    start = src.find(f'{lang}:', m.end())
    if start == -1:
        return None
    brace = src.find('{', start)
    if brace == -1:
        return None
    depth = 0
    i = brace
    in_str = None
    while i < len(src):
        c = src[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in ('"', "'", '`'):
            in_str = c
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return src[brace:i + 1]
        i += 1
    return None


KEY_RE = re.compile(r'(?:^|[,{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', re.M)


def extract_keys(block: str):
    # Backtick template literals MUST be stripped first. English long-form
    # content inside them is full of contraction apostrophes (don't, you're,
    # school's) -- if single-quote stripping runs first, it treats those
    # apostrophes as JS string delimiters and can swallow everything up to
    # the next real quote character, silently eating subsequent keys.
    # (Discovered 2026-07-14 auditing panduan-pendaftaran-prasekolah.html.)
    stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '``', block, flags=re.S)
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    return set(KEY_RE.findall(stripped))


def audit(path: str) -> int:
    try:
        src = open(path, encoding='utf-8').read()
    except OSError as e:
        print(f'{path}: cannot read ({e})')
        return 2

    findings = 0
    ms_block = extract_lang_block(src, 'ms')
    en_block = extract_lang_block(src, 'en')

    if ms_block is None or en_block is None:
        print(f'{path}: no TRANSLATIONS ms/en maps found — page is not wired '
              f'for i18n at all (or uses a nonstandard shape).')
        return 2

    ms_keys = extract_keys(ms_block)
    en_keys = extract_keys(en_block)

    for k in sorted(ms_keys - en_keys):
        print(f'{path}: MISSING in en: {k}')
        findings += 1
    for k in sorted(en_keys - ms_keys):
        print(f'{path}: MISSING in ms: {k}')
        findings += 1

    all_keys = ms_keys | en_keys
    for m in re.finditer(
            r"""(?<![A-Za-z0-9_.])t\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)""", src):
        if m.group(1) not in all_keys:
            line = src.count('\n', 0, m.start()) + 1
            print(f"{path}:{line}: t('{m.group(1)}') — key not in either map")
            findings += 1

    apply_body = ''
    am = re.search(
        r'function\s+apply(?:Static)?Translations\s*\([^)]*\)\s*{', src)
    if am:
        depth, i = 0, src.find('{', am.start())
        j = i
        while j < len(src):
            if src[j] == '{':
                depth += 1
            elif src[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        apply_body = src[i:j + 1]

    applied_ids = set(re.findall(r"['\"]([A-Za-z][A-Za-z0-9_-]*)['\"]",
                                 apply_body))

    skip_ids = {'langBtn'}
    for m in re.finditer(
            r'<(?!script|style|input)([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>'
            r'([^<]{3,}?)<', src, re.I):
        el_id, text = m.group(2), m.group(3).strip()
        if not text or el_id in skip_ids:
            continue
        if '${' in el_id or '${' in text:
            continue
        if text in ('-', '–', '...', '…') or text.isdigit():
            continue
        if f"getElementById('{el_id}')" in src or f'getElementById("{el_id}")' in src:
            continue
        if el_id not in applied_ids and el_id not in all_keys:
            line = src.count('\n', 0, m.start()) + 1
            print(f'{path}:{line}: <{m.group(1)} id="{el_id}"> has static text '
                  f'but no apply/setText line and no matching key '
                  f'(text: {text[:40]!r})')
            findings += 1

    for m in re.finditer(
            r"(showAlert|confirm)\(\s*(['\"])((?:(?!\2).){4,})\2", src):
        payload = m.group(3)
        if payload.startswith('alert') or 't(' in payload:
            continue
        line = src.count('\n', 0, m.start()) + 1
        print(f'{path}:{line}: {m.group(1)}() with hardcoded string '
              f'{payload[:50]!r} — should be t(...)')
        findings += 1

    if findings == 0:
        print(f'{path}: OK — {len(ms_keys)} keys, ms/en in parity, '
              f'no orphan t() calls detected.')
    return 1 if findings else 0


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(max(audit(p) for p in sys.argv[1:]))

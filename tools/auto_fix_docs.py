#!/usr/bin/env python3
"""Auto-fix documents to comply with STYLE_GUIDE.md (banned vocab + term unification + boundary spaces)."""
import os
import re
import sys

# Banned vocab replacements have been DISABLED.
# Naive substring replacement corrupted compound words (e.g. クリーン → 整然と
# rewrote スクリーン to ス整然と) and produced unnatural prose. Lint reports
# banned-vocab violations but the author MUST fix them by hand with semantic
# judgment. This list is intentionally kept empty.
BANNED_REPLACEMENTS = []

# Term unification replacements (regex, replacement)
TERM_REGEX = [
    (re.compile(r"ドキュメント"), "文書"),
    (re.compile(r"(?<![A-Za-z])sharedb(?![\w_-])"), "ShareDB"),
    (re.compile(r"share-db"), "ShareDB"),
    (re.compile(r"運用変換"), "操作変換"),
    (re.compile(r"総順序"), "全体順序"),
    (re.compile(r"ゲスト追跡ID"), "ゲストセッションID"),
    (re.compile(r"バッグラウンド"), "バックグラウンド"),
    (re.compile(r"(?<![A-Za-z])argon2id(?![A-Za-z0-9_])"), "Argon2id"),
    (re.compile(r"(?<![A-Za-z0-9])argon2(?![A-Za-z0-9_])"), "Argon2id"),
    (re.compile(r"Vitest\+"), "Vite+標準のテストランナー"),
]

# Boundary spaces removal
JP = r"[぀-ヿ一-鿿　-〿]"
ASCII_CLOSE = r"[a-zA-Z0-9_+\-)\]']"
ASCII_OPEN = r"[a-zA-Z0-9_+\-(\[']"
PREFIX_RE = re.compile(r"^(\s*(?:[-*+]\s+|#+\s+|\d+(?:\.\d+)*\.?\s+)*)")


ADR_TITLE_RE = re.compile(r"^(# ADR-\d{4}) ")


def fix_boundary_line(line):
    # Preserve ADR H1 title space (STYLE_GUIDE 4 exception)
    adr_m = ADR_TITLE_RE.match(line)
    if adr_m:
        keep = adr_m.group(1) + " "
        rest = line[len(keep):]
        prev = None
        while prev != rest:
            prev = rest
            rest = re.sub(rf"({JP}) +({ASCII_OPEN})", r"\1\2", rest)
            rest = re.sub(rf"({ASCII_CLOSE}) +({JP})", r"\1\2", rest)
        return keep + rest
    m = PREFIX_RE.match(line)
    prefix = m.group(1) if m else ""
    rest = line[len(prefix):]
    prev = None
    while prev != rest:
        prev = rest
        rest = re.sub(rf"({JP}) +({ASCII_OPEN})", r"\1\2", rest)
        rest = re.sub(rf"({ASCII_CLOSE}) +({JP})", r"\1\2", rest)
    return prefix + rest


def fix_file(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    original = content

    # Apply banned vocab replacements only outside code blocks
    out = []
    in_code = False
    for line in content.split("\n"):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if in_code:
            out.append(line)
            continue
        # Skip lines inside _quality docs (they describe the rules)
        # but still apply boundary fixes to _quality
        new_line = line
        # Banned vocab: skip in _quality dir
        if "_quality" not in path:
            for old, new in BANNED_REPLACEMENTS:
                if old in new_line:
                    new_line = new_line.replace(old, new)
        # Term unification - skip in _quality dir
        if "_quality" not in path:
            # Skip inline code spans
            parts = re.split(r"(`[^`]*`)", new_line)
            for i, part in enumerate(parts):
                if i % 2 == 1:
                    continue
                for regex, replacement in TERM_REGEX:
                    part = regex.sub(replacement, part)
                parts[i] = part
            new_line = "".join(parts)
        # Boundary spaces - apply everywhere except code blocks
        new_line = fix_boundary_line(new_line)
        out.append(new_line)
    content = "\n".join(out)
    if content != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "docs"
    changed = []
    for dirpath, _, filenames in os.walk(root):
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            p = os.path.join(dirpath, fn)
            if fix_file(p):
                changed.append(p)
    print(f"changed: {len(changed)} files")
    for p in changed[:30]:
        print(f"  {os.path.relpath(p, root)}")


if __name__ == "__main__":
    main()

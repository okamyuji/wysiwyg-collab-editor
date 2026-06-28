#!/usr/bin/env python3
"""Document lint based on STYLE_GUIDE.md and QUALITY_RUBRIC.md (version 1.0).

Usage:
    python3 tools/lint_docs.py docs/

Exit codes:
    0: no Critical or High violations
    1: at least one Critical or High violation
"""

import argparse
import os
import re
import sys
from collections import defaultdict

# STYLE_GUIDE 2.2 banned vocabulary
# Each entry: (pattern_regex, reason). The pattern is a compiled regex that
# matches the banned token while excluding known-compound contexts via
# negative lookbehind/lookahead. This kills false positives like
# "スクリーンリーダー" tripping the "クリーン" rule.
BANNED_VOCAB = [
    (re.compile(r"業界での実績ある標準"), "AI典型語彙"),
    (re.compile(r"最小ライン"), "AI典型語彙"),
    (re.compile(r"最小集合"), "AI典型語彙"),
    (re.compile(r"現行安定版"), "抽象すぎる"),
    (re.compile(r"事実上の標準"), "抽象すぎる"),
    (re.compile(r"直感的"), "AI典型語彙"),
    (re.compile(r"(?<![ァ-ヿ])シンプル(?![ァ-ヿ])"), "AI典型語彙"),
    (re.compile(r"(?<![ァ-ヿ])クリーン(?![ァ-ヿ])"), "AI典型語彙"),
    (re.compile(r"(?<![ァ-ヿ一-鿿])堅牢(?![ァ-ヿ一-鿿])"), "AI典型語彙"),
    (re.compile(r"(?<![ァ-ヿ一-鿿])柔軟(?![ァ-ヿ一-鿿])"), "AI典型語彙"),
    (re.compile(r"網羅的に"), "自己賞賛"),
    (re.compile(r"漏れがないように"), "自己賞賛"),
    (re.compile(r"逸脱を許さない"), "過剰強調"),
]

# STYLE_GUIDE 2.4 term unification
TERM_NORMALIZATION = [
    (r"ドキュメント", "文書", "用語不統一"),
    (
        r"(?<![A-Za-z])sharedb(?![\w_-])",
        "ShareDB",
        "用語不統一(STYLE_GUIDE 2.4: sharedb → ShareDB。ただし `sharedb-postgres` 等のパッケージ名はコードクォート内で扱うこと)",
    ),
    (r"share-db", "ShareDB", "用語不統一"),
    (r"運用変換", "操作変換", "用語不統一"),
    (r"総順序", "全体順序", "用語不統一"),
    (r"ゲスト追跡ID", "ゲストセッションID", "用語不統一"),
    (r"バッグラウンド", "バックグラウンド", "用語不統一"),
    (
        r"(?<![A-Za-z])argon2id(?![A-Za-z0-9_])",
        "Argon2id",
        "用語不統一(STYLE_GUIDE 2.4: argon2id → Argon2id。ただし `node-argon2` 等のパッケージ名はコードクォート内で扱うこと)",
    ),
    (
        r"(?<![A-Za-z0-9])argon2(?![A-Za-z0-9_])",
        "Argon2id",
        "用語不統一(STYLE_GUIDE 2.4: argon2 → Argon2id。ただし `node-argon2` 等のパッケージ名はコードクォート内で扱うこと)",
    ),
    (
        r"Vitest\+",
        "Vite+標準のテストランナー",
        "用語不統一(STYLE_GUIDE 2.4: Vitest+を単独製品名扱いせず「Vite+標準のテストランナー」と記述する)",
    ),
]

# STYLE_GUIDE 2.3 forbidden patterns
FORBIDDEN_PATTERNS = [
    (r"\*\*([^*]+)\*\*", "Markdown太字強調(`**`)を禁ずる(STYLE_GUIDE 2.3)"),
    (r"(?:^|\n)[^|\n]*[私僕俺]は", "一人称を禁ずる(STYLE_GUIDE 2.3)"),
]

# Japanese / ASCII boundary unwanted spaces
JAPANESE = r"[぀-ヿ一-鿿　-〿]"
ASCII_CLOSE = r"[a-zA-Z0-9_+\-)\]']"
ASCII_OPEN = r"[a-zA-Z0-9_+\-(\[']"
BOUNDARY_RE = [
    (
        re.compile(rf"({JAPANESE}) +({ASCII_OPEN})"),
        "STYLE_GUIDE 2.3 半角スペース禁止(日本語→英数字境界)",
    ),
    (
        re.compile(rf"({ASCII_CLOSE}) +({JAPANESE})"),
        "STYLE_GUIDE 2.3 半角スペース禁止(英数字→日本語境界)",
    ),
]

# Heading prefix for boundary exception (markdown list/heading + section number including letter suffix)
PREFIX_RE = re.compile(r"^(\s*(?:[-*+]\s+|#+\s+|\d+(?:\.\d+)*[a-z]?\.?\s+)*)")


def find_banned_vocab(content, path):
    findings = []
    in_code = False
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if "_quality" in path:
            continue
        for pattern, reason in BANNED_VOCAB:
            m = pattern.search(line)
            if m:
                findings.append(
                    (
                        "Critical",
                        path,
                        lineno,
                        f"禁止語彙「{m.group(0)}」({reason})の使用(STYLE_GUIDE 2.2)",
                    )
                )
    return findings


def find_term_unification(content, path):
    findings = []
    in_code = False
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        # Skip inline code spans
        parts = re.split(r"(`[^`]*`)", line)
        for i, part in enumerate(parts):
            if i % 2 == 1:
                continue
            for pattern, correct, reason in TERM_NORMALIZATION:
                if re.search(pattern, part):
                    if "_quality" in path:
                        continue
                    findings.append(
                        (
                            "Critical",
                            path,
                            lineno,
                            f"用語不統一: 「{correct}」に統一すべき({reason}、STYLE_GUIDE 2.4)",
                        )
                    )
                    break
    return findings


def find_forbidden_patterns(content, path):
    findings = []
    in_code = False
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        for pattern, reason in FORBIDDEN_PATTERNS:
            if re.search(pattern, line):
                if "_quality" in path:
                    continue
                findings.append(("High", path, lineno, reason))
                break
    return findings


ADR_TITLE_RE = re.compile(r"^# ADR-\d{4} ")


def find_boundary_spaces(content, path):
    findings = []
    in_code = False
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if "_quality" in path:
            continue
        # Exception: ADR H1 title format requires space after ADR-NNNN (STYLE_GUIDE 4)
        if ADR_TITLE_RE.match(line):
            # Drop the ADR-NNNN prefix, check rest only
            rest = re.sub(r"^# ADR-\d{4} ", "", line)
            for regex, reason in BOUNDARY_RE:
                if regex.search(rest):
                    findings.append(("Critical", path, lineno, reason))
                    break
            continue
        # Strip leading list/heading prefix
        m = PREFIX_RE.match(line)
        rest = line[len(m.group(1)) :] if m else line
        for regex, reason in BOUNDARY_RE:
            if regex.search(rest):
                findings.append(("Critical", path, lineno, reason))
                break
    return findings


def find_table_column_mismatch(content, path):
    findings = []
    in_code = False
    in_table = False
    expected_cols = 0
    table_start = 0
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if line.startswith("|") and "|" in line[1:]:
            # Count columns by | separators
            cols = len([c for c in line.strip().split("|") if c is not None]) - 2
            if not in_table:
                in_table = True
                expected_cols = cols
                table_start = lineno
            else:
                # Check for separator row
                if re.match(r"^\|[\s\-:|]+\|$", line.strip()):
                    continue
                if cols != expected_cols and cols > 0:
                    findings.append(
                        (
                            "Critical",
                            path,
                            lineno,
                            f"表の列数不一致(期待{expected_cols}列、検出{cols}列、表開始 L{table_start})",
                        )
                    )
        elif in_table and not line.startswith("|"):
            in_table = False
            expected_cols = 0
    return findings


def find_heading_skip(content, path):
    findings = []
    in_code = False
    prev_level = 0
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^(#+)\s+", line)
        if m:
            level = len(m.group(1))
            if prev_level > 0 and level > prev_level + 1:
                findings.append(
                    (
                        "High",
                        path,
                        lineno,
                        f"見出しレベルのスキップ(L{prev_level}→L{level})(STYLE_GUIDE 3.1)",
                    )
                )
            prev_level = level
    return findings


def find_numbered_list_gap(content, path):
    findings = []
    in_code = False
    list_stack = []  # list of (indent, last_number)
    for lineno, line in enumerate(content.splitlines(), start=1):
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            list_stack = []
            continue
        # Match numbered list
        m = re.match(r"^(\s*)(\d+)\.\s", line)
        if m:
            indent = len(m.group(1))
            num = int(m.group(2))
            # Pop stack to current indent
            while list_stack and list_stack[-1][0] > indent:
                list_stack.pop()
            if list_stack and list_stack[-1][0] == indent:
                last = list_stack[-1][1]
                if num != last + 1:
                    findings.append(
                        (
                            "High",
                            path,
                            lineno,
                            f"番号付きリストの欠番(直前{last}、検出{num})(STYLE_GUIDE 3.2)",
                        )
                    )
                list_stack[-1] = (indent, num)
            else:
                if num != 1:
                    # Starting list mid-sequence is OK (continuation)
                    pass
                list_stack.append((indent, num))
        else:
            if line.strip() == "":
                # Allow blank lines within lists
                continue
            else:
                # Non-list, non-blank: reset stack
                list_stack = []
    return findings


def find_adr_format(content, path):
    findings = []
    name = os.path.basename(path)
    if not (name.startswith("ADR-") and name.endswith(".md")):
        return findings
    if "README" in name:
        return findings
    required_sections = [
        "## ステータス",
        "## 文脈",
        "## 検討した選択肢",
        "## 決定",
        "## 根拠",
        "## 影響",
        "## 関連ADR",
        "## 自己レビュー記録",
    ]
    for section in required_sections:
        if section not in content:
            findings.append(
                ("High", path, 1, f"ADRに必須節「{section}」が欠落(QUALITY_RUBRIC 5)")
            )
    # H1 title format
    first_line = content.split("\n", 1)[0]
    if not re.match(r"^# ADR-\d{4} ", first_line):
        findings.append(
            (
                "High",
                path,
                1,
                "H1タイトルは `# ADR-NNNN タイトル` の形式とすること(STYLE_GUIDE 4)",
            )
        )
    return findings


def lint_file(path):
    with open(path, encoding="utf-8") as f:
        content = f.read()
    findings = []
    findings += find_banned_vocab(content, path)
    findings += find_term_unification(content, path)
    findings += find_forbidden_patterns(content, path)
    findings += find_boundary_spaces(content, path)
    findings += find_table_column_mismatch(content, path)
    findings += find_heading_skip(content, path)
    findings += find_numbered_list_gap(content, path)
    findings += find_adr_format(content, path)
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", help="documents root directory")
    parser.add_argument(
        "--max-show", type=int, default=200, help="limit displayed findings"
    )
    args = parser.parse_args()

    all_findings = []
    for dirpath, _, filenames in os.walk(args.root):
        if "/_quality" in dirpath or dirpath.endswith("_quality"):
            # Lint quality guides themselves only for forbidden patterns? skip self-checks
            pass
        for fn in sorted(filenames):
            if not fn.endswith(".md"):
                continue
            p = os.path.join(dirpath, fn)
            all_findings += lint_file(p)

    # Sort by severity
    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    all_findings.sort(key=lambda x: (severity_order.get(x[0], 99), x[1], x[2]))

    counts = defaultdict(int)
    for f in all_findings:
        counts[f[0]] += 1

    print("# Lint summary")
    for sev in ["Critical", "High", "Medium", "Low"]:
        print(f"- {sev}: {counts[sev]}")
    print()

    for sev, path, lineno, msg in all_findings[: args.max_show]:
        rel = os.path.relpath(path, args.root)
        print(f"[{sev}] {rel}:{lineno} {msg}")
    if len(all_findings) > args.max_show:
        print(f"... ({len(all_findings) - args.max_show} more)")

    if counts["Critical"] + counts["High"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

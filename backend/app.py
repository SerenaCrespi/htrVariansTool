#!/usr/bin/env python3
"""Local ALTO collation backend with optional Bertalign and lexical DP.

Processing overview:
1. Parse ALTO XML while preserving source pointers.
2. Align the continuous word streams and project results onto review rows.
3. Provide independent displaced-passage suggestions.
4. On explicit request, propose Bertalign passage anchors refined lexically.
"""
from __future__ import annotations

import argparse
from difflib import SequenceMatcher
from functools import lru_cache
import json
import re
import unicodedata
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

import semantic_alignment

from alto_support import ancestors, resolve_tagrefs, tag_definitions
from relocations import find_displaced_passages, summarize_ambiguities

ROOT = Path(__file__).resolve().parents[1]
# Bound request size so malformed or unexpectedly large browser payloads do not
# cause the local server to read unbounded data into memory.
MAX_BODY = 50 * 1024 * 1024


def local_name(tag: str) -> str:
    """Return an XML element name without its namespace prefix/URI."""
    return tag.rsplit("}", 1)[-1]


def parse_alto(xml_text: str, alto_file: str = "", next_page_start: list[str] | None = None,
               taxonomy: dict | None = None) -> list[dict]:
    """Read ALTO and keep local line/image pointers for review.

    Short bottom-of-page catchwords are omitted only when they repeat the
    opening words of the following page. Separate short lines elsewhere remain
    part of the text, so interlinear additions and corrections are retained.
    """
    # Parse XML with the standard library and convert parser errors into a
    # message that can be returned to the browser as a normal API error.
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid ALTO XML: {exc}") from exc
    # ALTO stores some metadata on parent blocks, so retain child-to-parent
    # links to recover block IDs and their semantic tags for each text line.
    parent_map = {child: parent for parent in root.iter() for child in parent}
    definitions = tag_definitions(root)
    source_image = next((node.text.strip() for node in root.iter()
                         if local_name(node.tag).lower() == "filename" and node.text and node.text.strip()), "")
    pages: list[list[tuple[str, dict]]] = []
    saw_lines = False
    # Parse page by page, preserving the order in the source ALTO document.
    for page_no, page in enumerate((node for node in root.iter() if local_name(node.tag) == "Page"), start=1):
        page_id = page.get("ID") or f"page-{page_no}"
        page_image = page.get("FILEID") or page.get("fileName") or source_image
        page_lines: list[tuple[str, dict]] = []
        for line_no, line in enumerate((node for node in page.iter() if local_name(node.tag) == "TextLine"), start=1):
            saw_lines = True
            # ALTO can store a line as several String elements. Join their
            # CONTENT values while keeping the TextLine as the source unit.
            line_words = [node.get("CONTENT", "") for node in line.iter()
                          if local_name(node.tag) == "String" and node.get("CONTENT")]
            if not line_words:
                continue
            line_text = " ".join(line_words)
            ancestor_nodes = ancestors(line, parent_map)
            block = next((node for node in ancestor_nodes if local_name(node.tag) == "TextBlock"), None)
            block_id = f"{page_id}:{block.get('ID') or 'block'}" if block is not None else f"{page_id}:block-unknown"
            block_tags = resolve_tagrefs(block.get("TAGREFS") if block is not None else "", definitions, taxonomy)
            line_tags = resolve_tagrefs(line.get("TAGREFS"), definitions, taxonomy)
            polygon = next((node.get("POINTS") for node in line.iter()
                            if local_name(node.tag) == "Polygon" and node.get("POINTS")), "")
            # These references travel with the unit through alignment, review,
            # image lookup and export; alignment never equates IDs across files.
            ref = {
                "page": page_id,
                "line": line.get("ID") or f"{alto_file}#{page_id}-line-{line_no}",
                "alto_file": alto_file,
                "image_file": page_image,
                "page_width": page.get("WIDTH", ""),
                "page_height": page.get("HEIGHT", ""),
                "line_text": line_text,
                "coords": ",".join(line.get(key, "") for key in ("HPOS", "VPOS", "WIDTH", "HEIGHT")),
                "polygon": polygon,
                "block_id": block_id,
                "block_tags": block_tags,
                "line_tags": line_tags,
                "page_order": page_no,
            }
            page_lines.append((line_text, ref))
        pages.append(page_lines)

    # Flatten page lines into one ordered witness sequence. A repeated short
    # catchword is omitted only when geometry confirms it is at page bottom.
    units: list[dict] = []
    for page_index, page_lines in enumerate(pages):
        if page_index + 1 < len(pages) and pages[page_index + 1]:
            following_start = normalize(pages[page_index + 1][0][0])
        else:
            following_start = next_page_start or []
        for line_index, (line_text, ref) in enumerate(page_lines):
            tokens = normalize(line_text)
            # Ignore a catchword only when it is short, at the physical bottom,
            # and repeated at the beginning of the next page/file.
            if line_index == len(page_lines) - 1 and 0 < len(tokens) <= 8 and following_start[:len(tokens)] == tokens:
                try:
                    page_h = float(ref.get("page_height") or 0)
                    y = float(ref.get("coords", "").split(",")[1])
                    h = float(ref.get("coords", "").split(",")[3])
                    at_bottom = page_h > 0 and (y + h) / page_h >= 0.90
                except (ValueError, IndexError):
                    at_bottom = False
                if at_bottom:
                    continue
            units.append({
                "text": line_text,
                "refs": [ref],
                "index": len(units) + 1,
                "kind": "alto_line",
                "structure_tags": sorted({tag.get("category") for tag in
                    ref.get("block_tags", []) + ref.get("line_tags", []) if tag.get("category")}),
            })
    if not saw_lines:
        raise ValueError("The file contains no ALTO TextLine elements.")
    return units

def normalize(text: str) -> list[str]:
    """Normalize spelling surface details for lexical comparison only.

    The original text remains untouched in each unit and is what the interface
    displays. This normalized token list is used only by alignment scores.
    """
    text = unicodedata.normalize("NFKD", text.casefold().replace("’", "'"))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.findall(r"[^\W_]+", text, flags=re.UNICODE)


@lru_cache(maxsize=32768)
def similarity(left: str, right: str) -> float:
    """Return a cached lexical score combining edit distance and word order."""
    a, b = normalize(left), normalize(right)
    if not a and not b:
        return 1.0

    def char_distance(x: str, y: str) -> float:
        prev = list(range(len(y) + 1))
        for i, cx in enumerate(x, 1):
            cur = [i]
            for j, cy in enumerate(y, 1):
                cur.append(min(cur[-1] + 1, prev[j] + 1,
                               prev[j - 1] + (cx != cy)))
            prev = cur
        return prev[-1] / max(len(x), len(y), 1)

    # Word-level Levenshtein allows small spelling/HTR differences at a
    # fractional substitution cost instead of treating every changed word as
    # wholly unrelated.
    prev = list(range(len(b) + 1))
    for i, wa in enumerate(a, 1):
        cur = [i]
        for j, wb in enumerate(b, 1):
            sub = 0.0 if wa == wb else char_distance(wa, wb)
            cur.append(min(cur[-1] + 1, prev[j] + 1, prev[j - 1] + sub))
        prev = cur
    edit_similarity = 1 - prev[-1] / max(len(a), len(b), 1)

    # Longest common subsequence rewards matching word order while allowing
    # insertions and short independent additions.
    lcs = [0] * (len(b) + 1)
    for wa in a:
        cur = [0]
        for j, wb in enumerate(b, 1):
            cur.append(lcs[j - 1] + 1 if wa == wb else max(lcs[j], cur[-1]))
        lcs = cur
    order_similarity = lcs[-1] / max(len(a), len(b), 1)
    return 0.72 * edit_similarity + 0.28 * order_similarity


def align(a: list[dict], b: list[dict], return_method: bool = False):
    """Align witnesses in three passes while preserving ALTO line references.

    Bertalign, when installed, supplies semantic anchors. Lexical dynamic
    programming refines those anchors; a final monotonic word-level pass can
    reconsider nearby line boundaries across adjacent anchors. The global
    retrieval pass remains a review suggestion layer in ``relocations.py``.
    """
    # Pass 1: ask Bertalign for coarse semantic spans. It is optional; a missing
    # package or a failed alignment returns None and activates the lexical path.
    coarse = _bertalign_spans(a, b)
    if coarse is not None:
        # Pass 2: refine each proposed span with line-level lexical DP, keeping
        # global offsets so the result still points into the original lists.
        refined = []
        for a0, a1, b0, b1 in coarse:
            refined.extend(_align_dp(a[a0:a1], b[b0:b1], a_offset=a0, b_offset=b0))
        # Keep the public method label stable: the frontend maps this exact
        # value to its Bertalign status message.
        method = "bertalign + weighted Levenshtein"
    else:
        # Fallback: align the complete ordered line sequences lexically.
        refined = _align_dp(a, b)
        method = "weighted Levenshtein fallback (Bertalign unavailable)"
    # Pass 3: first handle clear suffix/prefix overlaps, then check pairs of
    # neighboring groups even when their shapes differ (for example 1:1 + 1:2).
    refined = _merge_line_boundary_drift(a, b, refined)
    result = _recover_boundary_drift(a, b, refined)
    return (result, method) if return_method else result


def _word_stream(lines: list[dict]) -> list[dict]:
    """Flatten ALTO lines into words while retaining their source line refs."""
    words = []
    for line_index, line in enumerate(lines):
        refs = line.get("refs", [])
        for surface in line.get("text", "").split():
            key = " ".join(normalize(surface)) or surface.casefold()
            words.append({"text": surface, "key": key, "line_index": line_index,
                          "refs": refs, "parts": [surface]})

    # ALTO transcriptions often mark a word broken at a line end with =, -,
    # or the soft-hyphen sign. Treat its two printed fragments as one logical
    # comparison token, but keep both source line references and the exact
    # displayed surface.
    merged = []
    index = 0
    while index < len(words):
        current = words[index]
        if index + 1 < len(words):
            following = words[index + 1]
            marker = current["text"][-1:] in {"=", "-", "\u00ad"}
            if marker and following["line_index"] == current["line_index"] + 1:
                surface = current["text"] + following["text"]
                key = " ".join(normalize(current["text"].rstrip("=-\u00ad") + following["text"]))
                merged.append({"text": surface, "key": key, "line_index": current["line_index"],
                               "refs": current["refs"] + following["refs"],
                               "parts": current["parts"] + following["parts"]})
                index += 2
                continue
        merged.append(current)
        index += 1
    return merged


def _word_edit_ops(a: list[dict], b: list[dict]) -> list[tuple[str, int | None, int | None]]:
    """Anchor exact word runs, then use weighted word-level Levenshtein in gaps."""
    ak = [word["key"] for word in a]
    bk = [word["key"] for word in b]
    # Common function words are poor anchors and autojunk keeps the search
    # bounded on long witness files.
    matcher = SequenceMatcher(None, ak, bk, autojunk=True)
    ops = []

    def align_gap(a0, a1, b0, b1):
        n, m = a1 - a0, b1 - b0
        # Very large nonmatching spans are kept as additions/omissions. This
        # avoids quadratic memory use and prevents unrelated preliminaries
        # from being forced into word substitutions.
        if n * m > 250_000:
            ops.extend(("delete", i, None) for i in range(a0, a1))
            ops.extend(("insert", None, j) for j in range(b0, b1))
            return
        dp = [[0.0] * (m + 1) for _ in range(n + 1)]
        back = [[""] * (m + 1) for _ in range(n + 1)]
        for i in range(1, n + 1):
            dp[i][0], back[i][0] = float(i), "delete"
        for j in range(1, m + 1):
            dp[0][j], back[0][j] = float(j), "insert"
        @lru_cache(maxsize=8192)
        def substitution_cost(left, right):
            return 0.0 if left == right else 1.0 - SequenceMatcher(None, left, right).ratio()

        for i in range(1, n + 1):
            for j in range(1, m + 1):
                left, right = ak[a0 + i - 1], bk[b0 + j - 1]
                sub_cost = substitution_cost(left, right)
                choices = ((dp[i - 1][j - 1] + sub_cost, "pair"),
                           (dp[i - 1][j] + 1.0, "delete"),
                           (dp[i][j - 1] + 1.0, "insert"))
                dp[i][j], back[i][j] = min(choices, key=lambda item: item[0])
        gap_ops = []
        i, j = n, m
        while i or j:
            step = back[i][j]
            if step == "pair":
                gap_ops.append(("pair", a0 + i - 1, b0 + j - 1)); i -= 1; j -= 1
            elif step == "delete":
                gap_ops.append(("delete", a0 + i - 1, None)); i -= 1
            else:
                gap_ops.append(("insert", None, b0 + j - 1)); j -= 1
        ops.extend(reversed(gap_ops))

    ai = bi = 0
    for block in matcher.get_matching_blocks():
        align_gap(ai, block.a, bi, block.b)
        ops.extend(("pair", block.a + offset, block.b + offset)
                   for offset in range(block.size))
        ai, bi = block.a + block.size, block.b + block.size
    return ops


def _word_items(words: list[dict]) -> list[dict]:
    """Regroup aligned word fragments by their original ALTO line."""
    items = []
    for word in words:
        line_key = tuple(ref.get("line", "") for ref in word["refs"])
        if items and items[-1]["_line_key"] == line_key:
            items[-1]["text"] += " " + word["text"]
        else:
            items.append({"text": word["text"], "refs": word["refs"], "_line_key": line_key})
    for item in items:
        item.pop("_line_key", None)
    return items


def _recover_displaced_word_runs(a: list[dict], b: list[dict], ops: list[tuple[str, int | None, int | None]]):
    """Pair high-confidence unmatched word runs globally, independent of ALTO lines.

    ALTO line boundaries are intentionally absent here: each witness has
    already been flattened by ``_word_stream``. A displaced passage can
    therefore span several physical lines in either witness and still be
    compared as one continuous run.
    """
    a_runs, b_runs = [], []
    for operation, side in (("delete", a_runs), ("insert", b_runs)):
        start = None
        previous = None
        for op_index, (kind, ai, bi) in enumerate(ops + [("end", None, None)]):
            index = ai if operation == "delete" else bi
            if kind == operation and index is not None and (previous is None or index == previous + 1):
                if start is None:
                    start = op_index
                previous = index
                continue
            if start is not None:
                indexes = [ops[k][1 if operation == "delete" else 2] for k in range(start, op_index)]
                side.append((start, op_index, indexes))
                start = previous = None
            if kind == operation and index is not None:
                start = op_index
                previous = index

    candidates = []
    for arun in a_runs:
        a_indices = arun[2]
        if len(a_indices) < 2:
            continue
        left = " ".join(a[i]["text"] for i in a_indices)
        for brun in b_runs:
            b_indices = brun[2]
            if len(b_indices) < 2 or abs(len(a_indices) - len(b_indices)) > 2:
                continue
            right = " ".join(b[j]["text"] for j in b_indices)
            score = similarity(left, right)
            if score >= 0.78:
                candidates.append((score, arun, brun))

    used_a, used_b, pairing = set(), set(), {}
    for score, arun, brun in sorted(candidates, key=lambda item: (item[0], min(len(item[1][2]), len(item[2][2]))), reverse=True):
        a_indices, b_indices = arun[2], brun[2]
        if any(i in used_a for i in a_indices) or any(j in used_b for j in b_indices):
            continue
        # Align the two run interiors with the same weighted word edit logic;
        # only retain actual diagonal correspondences.
        local_ops = _word_edit_ops([a[i] for i in a_indices], [b[j] for j in b_indices])
        for kind, li, ri in local_ops:
            if kind == "pair" and li is not None and ri is not None:
                pairing[a_indices[li]] = b_indices[ri]
                used_a.add(a_indices[li]); used_b.add(b_indices[ri])

    recovered = []
    consumed_b = set(pairing.values())
    for kind, ai, bi in ops:
        if kind == "delete" and ai in pairing:
            target = pairing[ai]
            recovered.append(("pair", ai, target))
        elif kind == "insert" and bi in consumed_b:
            continue
        else:
            recovered.append((kind, ai, bi))
    return recovered


def align_alto_words(a_lines: list[dict], b_lines: list[dict]) -> list[dict]:
    """Align continuous word streams, then project correspondences onto A lines."""
    a, b = _word_stream(a_lines), _word_stream(b_lines)
    ops = _recover_displaced_word_runs(a, b, _word_edit_ops(a, b))
    # Corresponding words are projected onto reference-line segments. Every
    # unmatched run in B becomes its own row, split at physical ALTO line
    # boundaries, so additions retain their source layout.
    rows = []
    def new_row(a_line=None):
        row = {"aItems": [], "bWords": [], "a0": 0, "a1": 0, "b0": 0, "b1": 0}
        if a_line is not None:
            row["a0"], row["a1"] = a_line, a_line + 1
        rows.append(row)
        return row

    current_reference_line = None
    current_reference_row = None
    current_insertion_line = None
    current_insertion_row = None
    next_a_indices = [None] * len(ops)
    next_a = None
    for op_index in range(len(ops) - 1, -1, -1):
        next_a_indices[op_index] = next_a
        op, ai, _ = ops[op_index]
        if op in {"pair", "delete"} and ai is not None:
            next_a = ai
    for op_index, (op, ai, bi) in enumerate(ops):
        if op == "pair":
            line_index = a[ai]["line_index"]
            if current_reference_line != line_index or current_reference_row is None:
                row = new_row(line_index)
                current_reference_line, current_reference_row = line_index, row
            else:
                row = current_reference_row
            row["aItems"].append(a[ai])
            row["bWords"].append(b[bi])
            current_insertion_line = current_insertion_row = None
        elif op == "delete":
            line_index = a[ai]["line_index"]
            if current_reference_line != line_index or current_reference_row is None:
                row = new_row(line_index)
                current_reference_line, current_reference_row = line_index, row
            else:
                row = current_reference_row
            row["aItems"].append(a[ai])
            current_insertion_line = current_insertion_row = None
        else:
            # Unmatched B text always remains separate and is grouped by its
            # original ALTO line. This applies to prefixes, internal additions
            # and suffixes, so a long unmatched passage cannot collapse into
            # one review row. The next reference token starts a fresh segment.
            next_a = next_a_indices[op_index]
            b_line_index = b[bi]["line_index"]
            if current_insertion_row is None or current_insertion_line != b_line_index:
                row = new_row()
                if next_a is not None:
                    # Store the reference position as an empty interval; the
                    # row still displays no A text and keeps B's source line.
                    row["a0"] = row["a1"] = a[next_a]["line_index"]
                current_insertion_line, current_insertion_row = b_line_index, row
            else:
                row = current_insertion_row
            current_reference_row = None
            row["bWords"].append(b[bi])

    # Preserve empty/untokenizable reference lines as visible source rows.
    represented_line_ids = {ref.get("line") for word in a for ref in word.get("refs", [])}
    represented_line_indexes = {word["line_index"] for word in a}
    for line_index, line in enumerate(a_lines):
        ref_ids = {ref.get("line") for ref in line.get("refs", [])}
        if line_index not in represented_line_indexes and not (ref_ids & represented_line_ids):
            row = new_row(line_index)
            row["aItems"] = [{"text": line["text"], "refs": line.get("refs", [])}]

    # A short word can be split into a B-only row solely because it falls at
    # the end of one ALTO line, while its matching A word starts the next
    # line. Reattach it only when the following words confirm the same local
    # context; this avoids moving isolated common words based on lexical
    # similarity alone.
    compact_rows = []
    row_index = 0
    while row_index < len(rows):
        row = rows[row_index]
        following = rows[row_index + 1] if row_index + 1 < len(rows) else None
        if (following is not None and not row["aItems"] and len(row["bWords"]) == 1
                and following["aItems"] and following["bWords"]):
            displaced = row["bWords"][0]
            reference_words = following["aItems"]
            comparison_words = following["bWords"]
            context_matches = (
                len(reference_words) >= 2 and len(comparison_words) >= 1
                and displaced["key"] == reference_words[0]["key"]
                and comparison_words[0]["key"] == reference_words[1]["key"]
            )
            if context_matches:
                following["bWords"] = [displaced] + comparison_words
                row_index += 1
                continue
        compact_rows.append(row)
        row_index += 1
    rows = compact_rows

    # Monotonic sequence alignment cannot pair a passage that has moved across
    # other material. Recover strong matches between otherwise unmatched
    # reference and comparison rows globally before assigning public IDs.
    # The row stays at the reference position and keeps both witnesses' ALTO
    # pointers, so its identity is independent of the physical line number.
    reference_only = [row for row in rows if row["aItems"] and not row["bWords"]]
    comparison_only = [row for row in rows if row["bWords"] and not row["aItems"]]
    candidates = []
    for left in reference_only:
        left_text = " ".join(word["key"] for word in left["aItems"])
        left_tokens = normalize(left_text)
        if len(left_tokens) < 2:
            continue
        for right in comparison_only:
            right_text = " ".join(word["key"] for word in right["bWords"])
            right_tokens = normalize(right_text)
            if len(right_tokens) < 2:
                continue
            score = similarity(left_text, right_text)
            # Require a high lexical match and enough shared content to avoid
            # collapsing unrelated short headings or common formulae.
            if score >= 0.78 and min(len(left_tokens), len(right_tokens)) >= 2:
                candidates.append((score, left, right))
    used_left, used_right = set(), set()
    for score, left, right in sorted(candidates, key=lambda item: item[0], reverse=True):
        if id(left) in used_left or id(right) in used_right:
            continue
        left["bWords"] = right["bWords"]
        left["similarity"] = score
        used_left.add(id(left)); used_right.add(id(right))
    rows = [row for row in rows if id(row) not in used_right]

    result = []
    for index, row in enumerate(rows):
        a_items = _word_items(row["aItems"])
        b_items = _word_items(row["bWords"])
        left = " ".join(item["text"] for item in a_items)
        right = " ".join(item["text"] for item in b_items)
        score_left = " ".join(word["key"] for word in row["aItems"])
        score_right = " ".join(word["key"] for word in row["bWords"])
        result.append({"id": index, "a0": row["a0"], "a1": row["a1"],
                       "b0": row["b0"], "b1": row["b1"], "aItems": a_items,
                       "bItems": b_items, "score": 0,
                       "similarity": similarity(score_left, score_right) if score_left and score_right else 0.0})
    return result


def _suffix_prefix_overlap(left: str, right: str, max_words: int = 4) -> int:
    """Count matching words split across a line boundary in two witnesses.

    Small orthographic differences are allowed so HTR variation does not hide
    an otherwise clear overlap at the end/beginning of adjacent lines.
    """
    left_words, right_words = normalize(left), normalize(right)
    limit = min(max_words, len(left_words), len(right_words))
    return max((size for size in range(1, limit + 1)
                if all(x == y or SequenceMatcher(None, x, y).ratio() >= 0.78
                       for x, y in zip(left_words[-size:], right_words[:size]))), default=0)


def _merge_line_boundary_drift(a: list[dict], b: list[dict], groups: list[dict]) -> list[dict]:
    """Join adjacent 1:1 pairs when multiple words visibly cross a line break.

    ALTO line wrapping varies between witnesses. A short phrase can therefore
    appear at the end of one line in one witness and at the start of the next
    line in another. Keeping those pairs separate creates false omission and
    addition variants. Merge only a strong, exact two-word boundary overlap,
    and only when the combined passage remains lexically similar.
    """
    # This strict first boundary check handles the simple 1:1 + 1:1 case.
    # More general neighboring group shapes are handled by the next pass.
    merged: list[dict] = []
    index = 0
    while index < len(groups):
        current = groups[index]
        following = groups[index + 1] if index + 1 < len(groups) else None
        can_check = (
            following is not None
            and current["a1"] == following["a0"]
            and current["b1"] == following["b0"]
            and current["a1"] - current["a0"] == 1
            and current["b1"] - current["b0"] == 1
            and following["a1"] - following["a0"] == 1
            and following["b1"] - following["b0"] == 1
        )
        if can_check:
            a_first = a[current["a0"]]["text"]
            a_second = a[following["a0"]]["text"]
            b_first = b[current["b0"]]["text"]
            b_second = b[following["b0"]]["text"]
            overlap = max(_suffix_prefix_overlap(a_first, b_second),
                          _suffix_prefix_overlap(b_first, a_second))
            left = f"{a_first} {a_second}"
            right = f"{b_first} {b_second}"
            combined_similarity = similarity(left, right)
            if overlap >= 2 and combined_similarity >= 0.62:
                merged.append({
                    "id": len(merged),
                    "a0": current["a0"], "a1": following["a1"],
                    "b0": current["b0"], "b1": following["b1"],
                    "score": current.get("score", 0.0) + following.get("score", 0.0),
                    "similarity": combined_similarity,
                })
                index += 2
                continue
        merged.append({**current, "id": len(merged)})
        index += 1
    return merged


def _recover_boundary_drift(a: list[dict], b: list[dict], groups: list[dict]) -> list[dict]:
    """Join suspicious neighboring groups when their combined text fits better.

    The check is independent of the groups' 1:1, 1:2 or 2:1 shape, and bounded
    to three ALTO lines on either side. Thus it can repair a line-wrap shift
    after the first DP pass without turning a page into one review unit.
    """
    if len(groups) < 2:
        return groups
    # Re-evaluate adjacent groups from left to right. Restart after a merge so
    # a three-group local drift can be considered as two bounded comparisons.
    refined = [dict(group) for group in groups]
    changed = True
    while changed:
        changed = False
        for index in range(len(refined) - 1):
            first, second = refined[index:index + 2]
            if first["a1"] != second["a0"] or first["b1"] != second["b0"]:
                continue
            a0, a1, b0, b1 = first["a0"], second["a1"], first["b0"], second["b1"]
            # Keep the review units readable and do not merge across physical
            # pages, where repeated headers/catchwords can be misleading.
            if (a1 - a0 > 3 or b1 - b0 > 3 or _crosses_page_boundary(a[a0:a1])
                    or _crosses_page_boundary(b[b0:b1])):
                continue
            first_quality = _group_quality(a, b, first)
            second_quality = _group_quality(a, b, second)
            if min(first_quality, second_quality) >= 0.72:
                continue
            combined = {"a0": a0, "a1": a1, "b0": b0, "b1": b1}
            combined_quality = _group_quality(a, b, combined)
            # Two neighboring rows are combined only when the joint reading
            # is clearly better, and neither already has a strong match.
            # Require both a minimum absolute fit and a clear improvement over
            # either separate group to avoid merging unrelated neighboring text.
            if combined_quality >= 0.60 and combined_quality >= max(first_quality, second_quality) + 0.06:
                refined[index:index + 2] = [{**combined, "score": first.get("score", 0) + second.get("score", 0),
                                             "similarity": combined_quality}]
                changed = True
                break
    return _compact_alignment_groups(refined, a, b)


def _group_quality(a: list[dict], b: list[dict], group: dict) -> float:
    left = " ".join(item["text"] for item in a[group["a0"]:group["a1"]])
    right = " ".join(item["text"] for item in b[group["b0"]:group["b1"]])
    return similarity(left, right) if left and right else 0.0


def _crosses_page_boundary(units: list[dict]) -> bool:
    pages = [ref.get("page") for unit in units for ref in unit.get("refs", []) if ref.get("page")]
    return len(set(pages)) > 1


def _compact_alignment_groups(groups: list[dict], a: list[dict], b: list[dict]) -> list[dict]:
    """Restore contiguous coverage and stable IDs after local refinement."""
    if not groups:
        return groups
    ordered = sorted(groups, key=lambda g: (g["a0"], g["b0"]))
    compact = []
    ai = bi = 0
    for group in ordered:
        a0, a1 = group["a0"], group["a1"]
        b0, b1 = group["b0"], group["b1"]
        if a0 < ai or b0 < bi:
            # A token could be matched from multiple neighboring lines. Merge
            # overlapping ranges so neither line appears twice.
            if compact and a0 <= compact[-1]["a1"] and b0 <= compact[-1]["b1"]:
                old = compact[-1]
                old["a1"], old["b1"] = max(old["a1"], a1), max(old["b1"], b1)
                left = " ".join(x["text"] for x in a[old["a0"]:old["a1"]])
                right = " ".join(x["text"] for x in b[old["b0"]:old["b1"]])
                old["similarity"] = similarity(left, right) if left and right else 0.0
                ai, bi = old["a1"], old["b1"]
                continue
            continue
        if a0 > ai or b0 > bi:
            compact.append(_alignment_group(ai, a0, bi, b0, a, b))
        compact.append({**group})
        ai, bi = a1, b1
    if ai < len(a) or bi < len(b):
        compact.append(_alignment_group(ai, len(a), bi, len(b), a, b))
    for index, group in enumerate(compact):
        group["id"] = index
    return compact


def _bertalign_spans(a: list[dict], b: list[dict]) -> list[tuple[int, int, int, int]] | None:
    """Return Bertalign line-index spans, or None when its optional runtime is absent."""
    # Bertalign is deliberately optional at runtime. Callers can inspect the
    # returned method label to distinguish this path from the lexical fallback.
    try:
        from bertalign import Bertalign
    except ImportError:
        return None
    left = "\n".join(unit["text"].replace("\n", " ") for unit in a)
    right = "\n".join(unit["text"].replace("\n", " ") for unit in b)
    if not left.strip() or not right.strip():
        return None
    try:
        aligner = Bertalign(left, right, is_split=True)
        aligner.align_sents()
        pairs = list(aligner.sent_pairs())
    except Exception as exc:
        print(f"[align] Bertalign unavailable for this pair; using lexical DP only: {exc}")
        return None
    spans = []
    ai = bi = 0
    for src_segment, tgt_segment in pairs:
        x = _segment_line_count(src_segment, a, ai)
        y = _segment_line_count(tgt_segment, b, bi)
        if x is None or y is None:
            print("[align] Bertalign segments could not be mapped to ALTO lines; using lexical DP only")
            return None
        if x == 0 and y == 0:
            continue
        if ai + x > len(a) or bi + y > len(b):
            print("[align] Bertalign output could not be mapped to ALTO lines; using lexical DP only")
            return None
        spans.append((ai, ai + x, bi, bi + y))
        ai += x
        bi += y
    if ai != len(a) or bi != len(b):
        print("[align] Bertalign did not cover all ALTO lines; using lexical DP only")
        return None
    return spans


def _segment_line_count(segment, units: list[dict], start: int) -> int | None:
    """Map a Bertalign text segment back to the exact consecutive ALTO lines."""
    if isinstance(segment, (list, tuple)):
        target = normalize(" ".join(map(str, segment)))
    else:
        target = normalize(str(segment))
    if not target:
        return 0
    # Bertalign returns text segments rather than ALTO indices. Consume source
    # lines in order until their normalized tokens exactly reproduce a segment.
    collected: list[str] = []
    for count, unit in enumerate(units[start:], start=1):
        collected.extend(normalize(unit["text"]))
        if collected == target:
            return count
        if len(collected) >= len(target) and collected[:len(target)] != target:
            return None
    return None


def _align_dp(a: list[dict], b: list[dict], a_offset: int = 0, b_offset: int = 0) -> list[dict]:
    """Lexical dynamic programming supporting 1:n, n:1, n:m groups and gaps."""
    # Each DP cell represents a prefix of witness A and witness B. A transition
    # consumes one-sided material as a gap or a bounded group from both sides.
    n, m = len(a), len(b)
    dp = [[float("-inf")] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if dp[i][j] == float("-inf"):
                continue
            options = []
            if i < n:
                options.append((1, 0, -0.36))
            if j < m:
                options.append((0, 1, -0.36))
            # Consider 1-to-4 line spans on each side. The length penalty makes
            # large groups less attractive unless their combined text fits.
            for x in range(1, min(5, n - i + 1)):
                for y in range(1, min(5, m - j + 1)):
                    if i + x <= n and j + y <= m:
                        left = " ".join(s["text"] for s in a[i:i + x])
                        right = " ".join(s["text"] for s in b[j:j + y])
                        # Two independent gaps cost -0.72. Center match scores
                        # so unrelated lines prefer explicit omission/addition
                        # over a misleading correspondence.
                        options.append((x, y, 2 * similarity(left, right) - 1.0 - 0.38 * (x + y - 2)))
            for x, y, score in options:
                ni, nj = i + x, j + y
                if dp[i][j] + score > dp[ni][nj]:
                    dp[ni][nj] = dp[i][j] + score
                    back[ni][nj] = (i, j, x, y, score)
    # Backtrack from the final DP cell to recover the best monotonic path.
    groups = []
    i, j = n, m
    while i or j:
        step = back[i][j]
        if step is None:
            if i:
                groups.append((i - 1, i, j, j, 0.0))
                i -= 1
            else:
                groups.append((i, i, j - 1, j, 0.0))
                j -= 1
            continue
        pi, pj, x, y, score = step
        groups.append((pi, i, pj, j, score))
        i, j = pi, pj
    groups.reverse()
    # Convert local DP coordinates to witness-global half-open line intervals.
    result = []
    for index, (a0, a1, b0, b1, score) in enumerate(groups):
        left = " ".join(s["text"] for s in a[a0:a1])
        right = " ".join(s["text"] for s in b[b0:b1])
        result.append({"id": index, "a0": a_offset + a0, "a1": a_offset + a1,
                       "b0": b_offset + b0, "b1": b_offset + b1,
                       "score": score, "similarity": similarity(left, right) if left and right else 0.0})
    return result


def parse_alto_bundle(value, taxonomy: dict | None = None) -> list[dict]:
    """Parse either one ALTO string or a naturally sorted dossier of files."""
    if isinstance(value, str):
        return parse_alto(value, taxonomy=taxonomy)
    if not isinstance(value, list):
        raise ValueError("ALTO files must be provided as a list.")
    def natural_key(item):
        name = item.get("name", "") if isinstance(item, dict) else ""
        return [(0, int(part)) if part.isdigit() else (1, part.casefold())
                for part in re.split(r"(\d+)", name)]
    # Natural filename order keeps page2 before page10 and allows catchword
    # detection to inspect the first line of the next ALTO file.
    items = sorted(value, key=natural_key)
    combined = []
    for position, item in enumerate(items):
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            raise ValueError("Each ALTO file must include a filename and XML text.")
        following = []
        if position + 1 < len(items):
            try:
                next_root = ET.fromstring(items[position + 1]["text"])
                next_page = next((node for node in next_root.iter() if local_name(node.tag) == "Page"), None)
                first_line = next((node for node in next_page.iter() if local_name(node.tag) == "TextLine"), None) if next_page is not None else None
                following = normalize(" ".join(node.get("CONTENT", "") for node in first_line.iter()
                                                if local_name(node.tag) == "String")) if first_line is not None else []
            except (ET.ParseError, KeyError, TypeError):
                following = []
        combined.extend(parse_alto(item["text"], item.get("name", ""), following, taxonomy))
    for index, unit in enumerate(combined, start=1):
        unit["index"] = index
    return combined

def clean_sentences(value) -> list[dict]:
    """Validate the alternate plain-text sentence input format."""
    if not isinstance(value, list):
        raise ValueError("Edited units must be provided as a list of sentences.")
    cleaned = []
    for i, item in enumerate(value):
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            raise ValueError(f"Unit {i + 1}: invalid format.")
        refs = item.get("refs", [])
        if not isinstance(refs, list):
            refs = []
        cleaned.append({"text": item["text"], "refs": refs, "index": i + 1})
    return cleaned


def _alignment_groups_as_rows(groups: list[dict], a: list[dict], b: list[dict]) -> list[dict]:
    """Convert the sentence-level backup alignment to the frontend row schema."""
    rows = []
    for index, group in enumerate(groups):
        a_items = [{"text": unit["text"], "refs": unit.get("refs", [])}
                   for unit in a[group["a0"]:group["a1"]]]
        b_items = [{"text": unit["text"], "refs": unit.get("refs", [])}
                   for unit in b[group["b0"]:group["b1"]]]
        rows.append({"id": index, "a0": group["a0"], "a1": group["a1"],
                     "b0": group["b0"], "b1": group["b1"], "aItems": a_items,
                     "bItems": b_items, "score": group.get("score", 0),
                     "similarity": group.get("similarity", 0.0)})
    return rows


def align_witness_inputs(a: list[dict], b: list[dict]) -> tuple[list[dict], str, list[dict]]:
    """Use global word alignment first and Bertalign only if it yields no match."""
    try:
        alignments = align_alto_words(a, b)
    except Exception as exc:
        print(f"[align] Global word alignment failed; trying backup: {exc}")
        alignments = []
    has_matches = any(row.get("aItems") and row.get("bItems") for row in alignments)
    if has_matches:
        alignment_method = "word-level Levenshtein with global displaced-run recovery"
    else:
        # Bertalign's semantic segmentation is a backup only. Its output is
        # converted to the same UI schema; the normal path remains global.
        groups, backup_method = align(a, b, return_method=True)
        alignments = _alignment_groups_as_rows(groups, a, b)
        alignment_method = f"backup: {backup_method}"
    # Keep passage-movement suggestions independent from Bertalign as well.
    line_groups = _align_dp(a, b)
    transpositions = find_displaced_passages(a, b, line_groups, similarity)
    return alignments, alignment_method, transpositions


class Handler(SimpleHTTPRequestHandler):
    """Serve the local UI and the JSON alignment endpoint."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("[local] " + fmt % args)

    def do_GET(self):
        if urlparse(self.path).path == '/api/semantic-status':
            self._json(200, semantic_alignment.runtime_status())
            return
        # Restrict local static serving to the UI, bundled samples and assets.
        path = unquote(urlparse(self.path).path)
        if path == "/":
            self.path = "/index.html"
        elif path.startswith("/samples/"):
            allowed = {
                "/samples/Malmantile_VII.1397/DSC_0237.xml",
                "/samples/Malmantile_VII.1397/DSC_0237.JPG",
                "/samples/Malmantile_VII.1397/DSC_0238.xml",
                "/samples/Malmantile_VII.1397/DSC_0238.JPG",
                "/samples/Malmantile_IV.100/DSC_0356.xml",
                "/samples/Malmantile_IV.100/DSC_0356.JPG",
                "/samples/Malmantile_IV.100/DSC_0357.xml",
                "/samples/Malmantile_IV.100/DSC_0357.JPG",
            }
            if path not in allowed:
                self.send_error(404)
                return
            self.path = path
        elif path in {"/frontend.js", "/export-support.js", "/review-support.js"}:
            self.path = path
        elif path.startswith("/assets/"):
            name = Path(path).name
            if name not in {"logo_prima.png", "logo_primaWhite.png", "logo_erc.png", "varians_transparency.png"}:
                self.send_error(404)
                return
            self.path = "/assets/" + name
        else:
            self.send_error(404)
            return
        return super().do_GET()

    def _json(self, code, result):
        body = json.dumps(result, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        # The browser sends ALTO bundles (or pre-segmented sentences) here.
        # The server parses, aligns and returns source units plus review data.
        if urlparse(self.path).path not in {"/api/align", "/api/semantic-proposal"}:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("Invalid request size (maximum 50 MB).")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError('Expected a JSON object.')
            if urlparse(self.path).path == '/api/semantic-proposal':
                self._json(200, semantic_alignment.propose(payload.get('rows'), align_alto_words))
                return
            taxonomy = payload.get("taxonomy") if isinstance(payload.get("taxonomy"), dict) else None
            if "alto" in payload:
                alto = payload["alto"]
                a, b = parse_alto_bundle(alto.get("A", []), taxonomy), parse_alto_bundle(alto.get("B", []), taxonomy)
            elif "sentences" in payload:
                a = clean_sentences(payload["sentences"].get("A"))
                b = clean_sentences(payload["sentences"].get("B"))
            else:
                raise ValueError("Request does not contain ALTO files or sentences to align.")
            if not a or not b:
                raise ValueError("Each witness must contain at least one textual unit.")
            # Both uploaded ALTO and frontend-prepared sentence payloads use
            # the same continuous word-stream alignment.
            alignments, alignment_method, transpositions = align_witness_inputs(a, b)
            result = {
                "witnesses": {"A": a, "B": b},
                "alignments": alignments,
                "alignment_method": alignment_method,
                "possible_transpositions": transpositions,
                "frequent_ambiguous_cases": summarize_ambiguities(transpositions),
                "taxonomy_available": any(ref.get("line_tags") or ref.get("block_tags")
                    for witness in (a, b) for unit in witness for ref in unit.get("refs", [])),
            }
            body = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def main():
    """Start the local-only HTTP server and open its page in a browser."""
    parser = argparse.ArgumentParser(description="Local ALTO line alignment workspace")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=5010, type=int)
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        if args.port == 0:
            raise
        print(f"Port {args.port} is already in use; selecting an available local port ({exc}).")
        server = ThreadingHTTPServer((args.host, 0), Handler)
    url = f"http://{args.host}:{server.server_address[1]}"
    print(f"Collation workspace running at {url} (close this window to stop)")
    threading.Timer(1.0, lambda: webbrowser.open(url, new=2)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local server…")
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
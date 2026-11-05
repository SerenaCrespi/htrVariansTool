"""Second-pass search for unmatched passages that may have been moved."""
from __future__ import annotations

import re
import unicodedata


def _normal(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(re.findall(r"[^\W_]+", text, flags=re.UNICODE))


def _unmatched_spans(groups: list[dict], side: str) -> list[tuple[int, int]]:
    """Find runs where alignment groups do not include any units from other side."""
    indices = []
    for g in groups:
        a0, a1, b0, b1 = g["a0"], g["a1"], g["b0"], g["b1"]
        start, end = (a0, a1) if side == "A" else (b0, b1)
        other_start, other_end = (b0, b1) if side == "A" else (a0, a1)
        if end > start and other_end == other_start:
            indices.extend(range(start, end))
    spans = []
    for index in sorted(set(indices)):
        if spans and spans[-1][1] == index:
            spans[-1] = (spans[-1][0], index + 1)
        else:
            spans.append((index, index + 1))
    return spans


def find_displaced_passages(a: list[dict], b: list[dict], groups: list[dict], similarity,
                            min_similarity: float = 0.38, ambiguity_margin: float = 0.08,
                            max_candidates: int = 4) -> list[dict]:
    """Second-pass global retrieval for passages across the entire witnesses.

    It checks unmatched units first and can also find a passage that the
    monotonic local alignment incorrectly attached to another position.
    Proposed matches are review aids, never automatic editorial decisions.
    """
    gaps_a = _unmatched_spans(groups, "A")
    gaps_b = _unmatched_spans(groups, "B")
    aligned_pairs = set()
    for g in groups:
        if g["a1"] > g["a0"] and g["b1"] > g["b0"]:
            for i in range(g["a0"], g["a1"]):
                for j in range(g["b0"], g["b1"]):
                    aligned_pairs.add((i, j))
    # Search all units when local monotonic alignment absorbed moved material.
    a_ranges = gaps_a or [(i, i + 1) for i in range(len(a))]
    b_ranges = [(j, j + 1) for j in range(len(b))]
    candidates = []
    for a0, a1 in a_ranges:
        text_a = " ".join(unit["text"] for unit in a[a0:a1]).strip()
        if not text_a:
            continue
        ranked = []
        for b0, b1 in b_ranges:
            text_b = " ".join(unit["text"] for unit in b[b0:b1]).strip()
            if not text_b or (a1 == a0 + 1 and b1 == b0 + 1 and (a0, b0) in aligned_pairs):
                continue
            score = similarity(text_a, text_b)
            if score >= min_similarity:
                ranked.append((score, b0, b1, text_b))
        ranked.sort(reverse=True)
        if not ranked:
            continue
        best_score = ranked[0][0]
        second_score = ranked[1][0] if len(ranked) > 1 else 0.0
        margin = best_score - second_score
        status = "possible_transposition" if best_score >= 0.58 and margin >= ambiguity_margin else "ambiguous"
        for rank, (score, b0, b1, text_b) in enumerate(ranked[:max_candidates], start=1):
            candidate_status = status if rank == 1 else "ambiguous"
            refs_a = [ref for unit in a[a0:a1] for ref in unit.get("refs", [])]
            refs_b = [ref for unit in b[b0:b1] for ref in unit.get("refs", [])]
            candidates.append({"a0":a0,"a1":a1,"b0":b0,"b1":b1,"text_a":text_a,"text_b":text_b,
                "score":round(score,4),"margin":round(margin,4),"rank":rank,"status":candidate_status,
                "source_a":refs_a,"source_b":refs_b})
    return candidates


def summarize_ambiguities(candidates: list[dict]) -> list[dict]:
    """Count recurring ambiguous text pairs for the review dashboard."""
    counts = {}
    for index, item in enumerate(candidates):
        if item["status"] != "ambiguous":
            continue
        key = (_normal(item["text_a"]), _normal(item["text_b"]))
        if key not in counts:
            counts[key] = {"text_a": item["text_a"], "text_b": item["text_b"], "count": 0, "candidate_indexes": []}
        counts[key]["count"] += 1
        counts[key]["candidate_indexes"].append(index)
    return sorted(counts.values(), key=lambda row: row["count"], reverse=True)


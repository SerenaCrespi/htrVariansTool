"""Optional Bertalign passage proposals used by automatic lexical recovery."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import importlib.util
from numbers import Integral
import threading

_LOCK = threading.Lock()
_RUNTIME = None
_LAST_STATUS = None
MAX_ROWS = 40
MAX_CHARS = 100_000
MAX_ITEMS = 160


def runtime_status():
    if _RUNTIME is not None:
        state = _LAST_STATUS or 'ready'
    else:
        try:
            installed = importlib.util.find_spec('bertalign') is not None
        except (ImportError, ValueError):
            installed = False
        state = (_LAST_STATUS or 'available_not_loaded') if installed else 'not_installed'
    return {'engine': 'bertalign', 'status': state}


def _load_runtime():
    """Called under _LOCK. Bertalign's get_encoder caches the shared LaBSE model."""
    global _RUNTIME
    if _RUNTIME is None:
        from bertalign import Bertalign
        from bertalign.encoder import get_encoder
        _RUNTIME = (Bertalign, get_encoder())
    return _RUNTIME


def _inputs(rows):
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_ROWS:
        raise ValueError(f'Select between 1 and {MAX_ROWS} review units.')
    sides = [[], []]
    chars = 0
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Invalid review unit.')
        for side, key in enumerate(('aItems', 'bItems')):
            items = row.get(key)
            if not isinstance(items, list):
                raise ValueError('Source items must be lists.')
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get('text'), str):
                    raise ValueError('Source items must contain text.')
                refs = item.get('refs', [])
                if not isinstance(refs, list) or any(not isinstance(ref, dict) for ref in refs):
                    raise ValueError('Invalid ALTO source references.')
                text = ' '.join(item['text'].split())
                chars += len(text)
                if chars > MAX_CHARS:
                    raise ValueError('The selected passage is too large (maximum 100,000 characters).')
                if text:
                    sides[side].append({'text': text, 'refs': deepcopy(refs)})
                if len(sides[side]) > MAX_ITEMS:
                    raise ValueError(f'Select at most {MAX_ITEMS} source fragments per witness.')
    if not all(sides):
        raise ValueError('The selected interval must contain text in both witnesses.')
    return sides


def _blocks(units):
    """Use short contextual passages, retaining exact source-fragment bounds."""
    blocks = []
    start = count = 0
    for i, unit in enumerate(units):
        count += len(unit['text'].split())
        if count >= 30 or i - start + 1 >= 2:
            blocks.append((start, i + 1))
            start, count = i + 1, 0
    if start < len(units):
        blocks.append((start, len(units)))
    return blocks


def _spans(beads, left, right):
    if not isinstance(beads, (list, tuple)) or not beads:
        raise ValueError('Empty semantic alignment.')
    ai = bi = 0
    spans = []
    for bead in beads:
        if not isinstance(bead, (list, tuple)) or len(bead) != 2:
            raise ValueError('Invalid semantic alignment bead.')
        x, y = bead
        if (not isinstance(x, (list, tuple)) or not isinstance(y, (list, tuple))
                or any(isinstance(i, bool) or not isinstance(i, Integral) for i in [*x, *y]) or not (x or y)
                or list(x) != list(range(ai, ai + len(x)))
                or list(y) != list(range(bi, bi + len(y)))
                or ai + len(x) > len(left) or bi + len(y) > len(right)):
            raise ValueError('Semantic indices must cover both passages exactly and in order.')
        a0 = left[ai][0] if ai < len(left) else left[-1][1]
        b0 = right[bi][0] if bi < len(right) else right[-1][1]
        spans.append((a0, left[ai + len(x) - 1][1] if x else a0,
                      b0, right[bi + len(y) - 1][1] if y else b0))
        ai += len(x)
        bi += len(y)
    if ai != len(left) or bi != len(right):
        raise ValueError('Semantic alignment does not cover both passages.')
    return spans


def _conserved(original, rows, key):
    # Logical continuation tokens may join physical-line fragments. Removing
    # whitespace lets us check text conservation without undoing that join.
    before = Counter(''.join(''.join(u['text'].split()) for u in original))
    after = Counter(''.join(''.join(u['text'].split()) for row in rows for u in row[key]))
    return before == after


def propose(rows, refine):
    """Return a proposal, never a replacement disguised as a semantic fallback."""
    global _LAST_STATUS
    a, b = _inputs(rows)
    left, right = _blocks(a), _blocks(b)
    result = {'engine': 'bertalign', 'model': 'LaBSE', 'status': None,
              'input_units': len(rows), 'semantic_blocks': {'A': len(left), 'B': len(right)}}
    with _LOCK:
        try:
            aligner_class, encoder = _load_runtime()
        except ModuleNotFoundError as exc:
            result['status'] = 'not_installed' if exc.name == 'bertalign' else 'dependency_unavailable'
        except (ImportError, SyntaxError):
            result['status'] = 'dependency_unavailable'
        except Exception:
            result['status'] = 'model_unavailable'
        else:
            texts = lambda units, blocks: '\n'.join(' '.join(u['text'] for u in units[start:end]) for start, end in blocks)
            try:
                aligner = aligner_class(texts(a, left), texts(b, right), is_split=True,
                                        model=encoder, top_k=min(3, len(right)))
                aligner.align_sents()
            except Exception:
                result['status'] = 'alignment_failed'
            else:
                try:
                    spans = _spans(aligner.result, left, right)
                except (ValueError, AttributeError):
                    result['status'] = 'invalid_mapping'
                else:
                    if not any(a1 > a0 and b1 > b0 for a0, a1, b0, b1 in spans):
                        result['status'] = 'no_correspondence'
                    else:
                        try:
                            proposed = []
                            for a0, a1, b0, b1 in spans:
                                refined = refine(deepcopy(a[a0:a1]), deepcopy(b[b0:b1]))
                                for row in refined:
                                    row['a0'] += a0
                                    row['a1'] += a0
                                    row['b0'] += b0
                                    row['b1'] += b0
                                proposed.extend(refined)
                            for i, row in enumerate(proposed):
                                row['id'] = i
                            if not proposed or not _conserved(a, proposed, 'aItems') or not _conserved(b, proposed, 'bItems'):
                                raise ValueError('Refinement changed source text.')
                        except Exception:
                            result['status'] = 'refinement_failed'
                        else:
                            result.update(status='proposal_ready', alignments=proposed,
                                          method='Bertalign passage anchors + word-level Levenshtein')
        _LAST_STATUS = result['status']
    return result

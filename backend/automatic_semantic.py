"""Bounded, automatic semantic recovery after lexical alignment."""
from collections import Counter
from copy import deepcopy
import json

import semantic_alignment

WEAK_THRESHOLD = 0.45
ANCHOR_THRESHOLD = 0.65
MIN_WINDOW_WORDS = 8
MIN_GAIN = 0.04
MAX_ATTEMPTS = 3


def _text(row, side):
    return ' '.join(item['text'] for item in row[side])


def _counts(row):
    return [len(_text(row, side).split()) for side in ('aItems', 'bItems')]


def _score(row, similarity):
    a, b = _counts(row)
    return similarity(_text(row, 'aItems'), _text(row, 'bItems')) if a and b else 0.0


def _windows(rows, similarity):
    """Weak runs need evidence on both sides; isolated short variants are normal."""
    windows = []
    i = 0
    while i < len(rows):
        if _score(rows[i], similarity) >= WEAK_THRESHOLD:
            i += 1
            continue
        start = i
        while i < len(rows) and _score(rows[i], similarity) < WEAK_THRESHOLD:
            i += 1
        core = rows[start:i]
        counts = [sum(_counts(row)[side] for row in core) for side in (0, 1)]
        if not all(counts) or (len(core) < 2 and min(counts) < 12):
            continue
        a, b = max(0, start - 1), min(len(rows), i + 1)
        totals = [sum(_counts(row)[side] for row in rows[a:b]) for side in (0, 1)]
        if min(totals) < MIN_WINDOW_WORDS:
            continue
        if windows and a < windows[-1][1]:
            windows[-1] = (windows[-1][0], b)
        else:
            windows.append((a, b))
    return windows


def _quality(rows, similarity):
    totals = [sum(_counts(row)[side] for row in rows) for side in (0, 1)]
    evidence = sum(min(_counts(row)) * _score(row, similarity) for row in rows)
    return evidence / max(*totals, 1)


def _refs(rows, side):
    return {json.dumps(ref, sort_keys=True, ensure_ascii=False)
            for row in rows for item in row[side] for ref in item.get('refs', [])}


def _signature(row):
    return tuple((_text(row, side), tuple(sorted(_refs([row], side))))
                 for side in ('aItems', 'bItems'))


def _valid_source(original, proposed):
    if not isinstance(proposed, list) or not proposed:
        return False
    try:
        for side in ('aItems', 'bItems'):
            before = ''.join(''.join(_text(row, side).split()) for row in original)
            after = ''.join(''.join(_text(row, side).split()) for row in proposed)
            # A remains ordered; B may contain the lexical displaced-run recovery.
            if (before != after if side == 'aItems' else Counter(before) != Counter(after)):
                return False
            if _refs(original, side) != _refs(proposed, side):
                return False
    except (KeyError, TypeError, ValueError):
        return False
    return True


def recover(rows, refine, similarity, proposer=None):
    """Return rows + observable diagnostics. Failures always retain lexical rows."""
    proposer = proposer or semantic_alignment.propose
    windows = _windows(rows, similarity)
    diagnostics = {
        'strategy': 'automatic', 'engine': 'bertalign', 'status': 'not_needed',
        'candidates': len(windows), 'attempted': 0, 'accepted': 0, 'windows': [],
        'policy': {'weakThreshold': WEAK_THRESHOLD, 'anchorThreshold': ANCHOR_THRESHOLD,
                   'minWindowWords': MIN_WINDOW_WORDS, 'minGain': MIN_GAIN,
                   'maxWindowUnits': semantic_alignment.MAX_ROWS, 'maxAttempts': MAX_ATTEMPTS},
    }
    replacements = {}
    unavailable = None
    for start, end in windows:
        record = {'fromUnit': start + 1, 'toUnit': end}
        diagnostics['windows'].append(record)
        if unavailable:
            record['status'] = 'not_attempted_after_failure'
            continue
        if end - start > semantic_alignment.MAX_ROWS:
            record['status'] = 'window_limit'
            continue
        if diagnostics['attempted'] >= MAX_ATTEMPTS:
            record['status'] = 'attempt_limit'
            continue
        original = rows[start:end]
        diagnostics['attempted'] += 1
        try:
            result = proposer(deepcopy(original), refine)
        except ValueError:
            record['status'] = 'input_limit'
            continue
        except Exception:
            record['status'] = 'alignment_failed'
            unavailable = record['status']
            continue
        if not isinstance(result, dict) or not isinstance(result.get('status'), str):
            record['status'] = 'invalid_mapping'
            continue
        record['status'] = result['status']
        if result['status'] != 'proposal_ready':
            if result['status'] in {'not_installed', 'dependency_unavailable', 'model_unavailable', 'alignment_failed'}:
                unavailable = result['status']
            continue
        proposed = result.get('alignments')
        if not _valid_source(original, proposed):
            record['status'] = 'source_changed'
            continue
        anchors = Counter(_signature(row) for row in original if _score(row, similarity) >= ANCHOR_THRESHOLD)
        available = Counter(_signature(row) for row in proposed)
        if anchors - available:
            record['status'] = 'anchor_changed'
            continue
        before, after = _quality(original, similarity), _quality(proposed, similarity)
        record.update(beforeQuality=round(before, 5), afterQuality=round(after, 5))
        if after - before < MIN_GAIN:
            record['status'] = 'no_improvement'
            continue
        replacement = deepcopy(proposed)
        for row in replacement:
            row['alignment_source'] = 'bertalign_automatic'
            row['semantic_review'] = True
        replacements[start] = (end, replacement)
        record['status'] = 'applied'
        diagnostics['accepted'] += 1
    if diagnostics['accepted']:
        diagnostics['status'] = 'applied'
    elif unavailable:
        diagnostics['status'] = unavailable
    elif windows:
        diagnostics['status'] = 'kept_lexical' if diagnostics['attempted'] else 'limit_reached'
    if not replacements:
        return rows, diagnostics
    recovered = []
    i = 0
    while i < len(rows):
        if i in replacements:
            end, replacement = replacements[i]
            recovered.extend(replacement)
            i = end
        else:
            recovered.append(deepcopy(rows[i]))
            i += 1
    for index, row in enumerate(recovered):
        row['id'] = index
    return recovered, diagnostics

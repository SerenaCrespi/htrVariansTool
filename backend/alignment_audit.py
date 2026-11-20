"""Project full-document comparisons and draw a shared ALTO audit sample."""
from collections import defaultdict
from random import Random
from secrets import randbits

BLOCK_SIZE = 10
BLOCKS_PER_STRATUM = 4


def _key(ref):
    return (ref.get("alto_file"), ref.get("page"), ref["line"]) if ref.get("line") else None


def _items(units):
    locations = defaultdict(set)
    for index, unit in enumerate(units, 1):
        for ref in unit.get("refs", []):
            if key := _key(ref):
                locations[key].add(index)
    return locations


def project(rows, witnesses):
    """Use fragment provenance rather than the bounding range of a word row."""
    locations = [_items(units) for units in witnesses]
    links = [[set() for _ in units] for units in witnesses]
    seen = [set(), set()]
    unresolved = [set(), set()]
    for row in rows:
        sides = []
        for side, field in enumerate(("aItems", "bItems")):
            indexes = set()
            missing = False
            for item in row[field]:
                for ref in item.get("refs", []):
                    matches = locations[side].get(_key(ref), ())
                    if len(matches) == 1:
                        indexes.update(matches)
                    else:
                        missing = True
                if not item.get("refs"):
                    missing = True
            sides.append((indexes, missing))
        for side, (indexes, _) in enumerate(sides):
            opposite, incomplete = sides[1 - side]
            seen[side].update(indexes)
            for index in indexes:
                links[side][index - 1].update(opposite)
            if incomplete:
                unresolved[side].update(indexes)
    return [[sorted(targets) if i in seen[side] and i not in unresolved[side] else None
             for i, targets in enumerate(mapping, 1)]
            for side, mapping in enumerate(links)]


def sample(witnesses, methods, seed=None, plan="standard"):
    if len(methods) < 2:
        return None
    seed = randbits(32) if seed is None else seed
    random = Random(seed)
    blocks = []
    strata = []
    for side, units in enumerate(witnesses):
        pools = defaultdict(list)
        for start in range(0, len(units), BLOCK_SIZE):
            stop = min(start + BLOCK_SIZE, len(units))
            disagree = any(len({repr(m[side][i]) for m in methods.values()}) > 1
                           for i in range(start, stop))
            pools[disagree].append((start, stop))
        for disagree, pool in sorted(pools.items()):
            count = {"standard": BLOCKS_PER_STRATUM, "extended": 12,
                     "complete": len(pool)}[plan]
            selected = sorted(random.sample(pool, min(len(pool), count)))
            strata.append({"side": side, "disagree": disagree, "population": len(pool),
                           "maxSize": max(stop - start for start, stop in pool)})
            for start, stop in selected:
                blocks.append({"stratum": len(strata) - 1, "side": side, "start": start,
                               "rows": [{name: mapping[side][i] for name, mapping in methods.items()}
                                        for i in range(start, stop)]})
    return {"seed": seed, "strata": strata, "blocks": blocks, "methods": list(methods),
            "referenceRows": [{name: mapping[0][i] for name, mapping in methods.items()}
                              for i in range(len(witnesses[0]))],
            "texts": [[unit["text"] for unit in units] for units in witnesses]}

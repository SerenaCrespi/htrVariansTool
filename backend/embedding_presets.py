"""CPU-only embedding presets for the common ALTO alignment pipeline."""
from collections import Counter
from functools import lru_cache
from hashlib import sha256
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from urllib.request import urlopen

MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78"
MODEL = "multilingual-e5-small INT8"
PRESETS = ("semantic", "hybrid")
BASE_URL = f"https://huggingface.co/Xenova/multilingual-e5-small/resolve/{MODEL_REVISION}"
FILES = {
    "tokenizer.json": (17082730, "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"),
    "onnx/model_quantized.onnx": (118308185, "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193"),
}
_LOCK = Lock()
MAX_STATES = 300_000
STEPS = ((1, 1), (1, 2), (2, 1), (1, 0), (0, 1))


class EmbeddingUnavailable(ValueError):
    pass


def _hash(file):
    digest = sha256()
    for chunk in iter(lambda: file.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest


def _artifact(name):
    size, digest = FILES[name]
    cache = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    destination = cache / "htrvarians" / MODEL_REVISION / Path(name).name
    if destination.is_file() and destination.stat().st_size == size:
        with destination.open("rb") as existing:
            if _hash(existing).hexdigest() == digest:
                return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destination.parent, delete=False) as temp:
        temporary = Path(temp.name)
        try:
            with urlopen(f"{BASE_URL}/{name}", timeout=45) as response:
                remaining = size
                while remaining and (chunk := response.read(min(remaining, 1024 * 1024))):
                    temp.write(chunk)
                    remaining -= len(chunk)
                if remaining or response.read(1):
                    raise EmbeddingUnavailable(f"Unexpected download size for {name}.")
            temp.close()
            with temporary.open("rb") as downloaded:
                if _hash(downloaded).hexdigest() != digest:
                    raise EmbeddingUnavailable(f"Checksum mismatch for {name}.")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    return destination


@lru_cache(maxsize=1)
def _runtime():
    try:
        import numpy as np
        import onnxruntime as ort
        from tokenizers import Tokenizer
    except ImportError as exc:
        raise EmbeddingUnavailable("Install the optional dependencies from requirements-embeddings.txt.") from exc
    tokenizer = Tokenizer.from_file(str(_artifact("tokenizer.json")))
    tokenizer.enable_padding(pad_id=tokenizer.token_to_id("<pad>"), pad_token="<pad>")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(_artifact("onnx/model_quantized.onnx")),
                                   sess_options=options, providers=["CPUExecutionProvider"])
    return np, tokenizer, session


def embed(texts):
    with _LOCK:
        try:
            np, tokenizer, session = _runtime()
            inputs = {item.name for item in session.get_inputs()}
            for start in range(0, len(texts), 8):
                encoded = tokenizer.encode_batch(["query: " + text for text in texts[start:start + 8]])
                if len(encoded[0].ids) > 512:
                    raise EmbeddingUnavailable("An ALTO unit or group exceeds the model's 512-token limit.")
                mask = np.array([item.attention_mask for item in encoded], dtype=np.int64)
                values = {
                    "input_ids": np.array([item.ids for item in encoded], dtype=np.int64),
                    "attention_mask": mask,
                    "token_type_ids": np.array([item.type_ids for item in encoded], dtype=np.int64),
                }
                hidden = session.run(["last_hidden_state"], {key: values[key] for key in inputs})[0]
                pooled = (hidden * mask[:, :, None]).sum(axis=1)
                pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
                yield from pooled.astype(np.float32)
        except EmbeddingUnavailable:
            raise
        except Exception as exc:
            raise EmbeddingUnavailable(f"Embedding model unavailable: {exc}") from exc


def _texts(units):
    return [" ".join(unit["text"].split()) for unit in units]


def prepare(a, b, normalize, encoder=None):
    """Encode each distinct one- or two-unit candidate once for both presets."""
    left, right = _texts(a), _texts(b)
    bands = list(_bands(left, right, normalize))
    if sum(map(len, bands)) > MAX_STATES:
        raise EmbeddingUnavailable("The semantic search exceeds the experimental size limit.")
    spans = [{(i, size): " ".join(texts[i:i + size]).strip()
              for i in range(len(texts)) for size in (1, 2) if i + size <= len(texts)}
             for texts in (left, right)]
    unique = list(dict.fromkeys(text for side in spans for text in side.values() if text))
    vectors = dict(zip(unique, (encoder or embed)(unique), strict=True))
    return bands, spans, vectors


def _bands(left, right, normalize):
    # Rare exact matches guide the search without forcing a correspondence.
    def keys(texts):
        return [tuple(tokens) if len(tokens) >= 5 else ()
                for tokens in map(normalize, texts)]

    a, b = keys(left), keys(right)
    counts_a, counts_b = Counter(a), Counter(b)
    positions = {key: i for i, key in enumerate(b, 1) if key and counts_b[key] == 1}
    candidates = [(i, positions[key]) for i, key in enumerate(a, 1)
                  if counts_a[key] == 1 and key in positions and i < len(a) and positions[key] < len(b)]
    anchors = [(0, 0)]
    # Reject crossings on both sides, including isolated out-of-order matches.
    suffix = [len(b)] * (len(candidates) + 1)
    for index in range(len(candidates) - 1, -1, -1):
        suffix[index] = min(suffix[index + 1], candidates[index][1])
    highest = 0
    for index, (i, j) in enumerate(candidates):
        if highest < j < suffix[index + 1]:
            anchors.append((i, j))
        highest = max(highest, j)
    anchors.append((len(a), len(b)))
    last_high = 0
    for (a0, b0), (a1, b1) in zip(anchors, anchors[1:]):
        radius = min(64, 8 + max(a1 - a0, b1 - b0) // 5)
        for i in range(a0, a1 + (a1 == len(a))):
            center = b0 + (b1 - b0) * (i - a0) // (a1 - a0)
            low, high = max(0, min(center - radius, last_high)), min(len(b), center + radius)
            yield range(low, high + 1)
            last_high = high


def align(a, b, preset, similarity, normalize, prepared=None):
    bands, (left, right), vectors = prepared if prepared is not None else prepare(a, b, normalize)
    best = {(0, 0): 0.0}
    back = {}
    for i, band in enumerate(bands):
        for j in band:
            if (i, j) not in best:
                continue
            score = best.pop((i, j))
            for x, y in STEPS:
                ni, nj = i + x, j + y
                if ni >= len(bands) or nj not in bands[ni]:
                    continue
                lexical = 0.0
                semantic = None
                gain = -0.14
                if x and y:
                    at, bt = left[i, x], right[j, y]
                    if not at or not bt:
                        continue
                    semantic = float(vectors[at] @ vectors[bt])
                    if preset == "hybrid":
                        lexical = similarity(at, bt)
                    evidence = semantic if preset == "semantic" else 0.65 * semantic + 0.35 * lexical
                    gain = max(x, y) * (evidence - 0.72) - 0.08 * (x + y - 2)
                if score + gain > best.get((ni, nj), float("-inf")):
                    best[ni, nj] = score + gain
                    back[ni, nj] = (i, j, gain, semantic)
    i, j = len(a), len(b)
    rows = []
    while i or j:
        if (i, j) not in back:
            raise EmbeddingUnavailable("No path within the experimental search band.")
        ai, bj, score, semantic = back[i, j]
        lexical = similarity(left[ai, i - ai], right[bj, j - bj]) if semantic is not None else 0.0
        rows.append({"a0": ai, "a1": i, "b0": bj, "b1": j,
                     "score": score, "similarity": lexical, "semantic_score": semantic,
                     "semantic_review": semantic is not None and lexical < 0.55})
        i, j = ai, bj
    return rows[::-1]

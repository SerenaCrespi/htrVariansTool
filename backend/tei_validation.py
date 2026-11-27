"""Validate editor drafts against the bundled TEI P5 Relax NG grammar."""

from functools import lru_cache
from pathlib import Path
from threading import Lock

_schema_lock = Lock()


@lru_cache(maxsize=1)
def _schema():
    from lxml import etree

    return etree.RelaxNG(file=str(Path(__file__).with_name("tei_all.rng")))


def validate_tei(source):
    from lxml import etree

    parser = etree.XMLParser(
        encoding="UTF-8", resolve_entities=False, load_dtd=False, no_network=True
    )
    try:
        root = etree.fromstring(source, parser)
    except etree.XMLSyntaxError as exc:
        return str(exc)

    if root.getroottree().docinfo.doctype:
        return "Remove the DOCTYPE declaration to validate the TEI."

    # The validator's error log belongs to the shared schema instance.
    with _schema_lock:
        schema = _schema()
        if schema.validate(root):
            return None
        error = schema.error_log.last_error
        return f"Line {error.line or 1}: {error.message}"

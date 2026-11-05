"""Optional ALTO tag and taxonomy helpers.

Tag names are metadata hints. None of the functions in this module requires
tags or shared IDs between witnesses.
"""
from __future__ import annotations

import re


DEFAULT_TAXONOMY = {
    "mainzone": "text",
    "rubric": "rubric",
    "chapter": "chapter",
    "title": "heading",
    "speaker": "speaker",
    "stage": "stage_direction",
    "stagedirection": "stage_direction",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def tag_definitions(root) -> dict[str, dict[str, str]]:
    """Map ALTO tag IDs to their declared type/label, when declarations exist."""
    definitions = {}
    for node in root.iter():
        identifier = node.get("ID")
        if not identifier:
            continue
        name = local_name(node.tag).casefold()
        if not name.endswith("tag"):
            continue
        definitions[identifier] = {
            "element": local_name(node.tag),
            "type": node.get("TYPE", ""),
            "label": node.get("LABEL", ""),
            "description": node.get("DESCRIPTION", ""),
        }
    return definitions


def resolve_tagrefs(value: str | None, definitions: dict, taxonomy: dict | None = None) -> list[dict]:
    """Resolve TAGREFS but preserve unknown references as raw metadata."""
    mapping = {str(k).casefold(): v for k, v in (taxonomy or DEFAULT_TAXONOMY).items()}
    refs = re.split(r"[\s,;]+", value or "")
    resolved = []
    for ref in filter(None, refs):
        definition = definitions.get(ref, {})
        raw_type = definition.get("type", "")
        label = definition.get("label", "")
        key = (raw_type or label).casefold().replace("_", "").replace(" ", "")
        category = mapping.get(key)
        resolved.append({
            "ref": ref,
            "type": raw_type,
            "label": label,
            "category": category,
            "known": bool(definition),
        })
    return resolved


def ancestors(node, parent_map) -> list:
    result = []
    parent = parent_map.get(node)
    while parent is not None:
        result.append(parent)
        parent = parent_map.get(parent)
    return result


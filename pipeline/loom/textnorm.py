"""Name / character string normalization."""

from __future__ import annotations

import re
import unicodedata


_DIACRITIC_MAP = str.maketrans(
    {
        "ā": "a",
        "ē": "e",
        "ī": "i",
        "ō": "o",
        "ū": "u",
        "Ā": "A",
        "Ē": "E",
        "Ī": "I",
        "Ō": "O",
        "Ū": "U",
        "û": "u",
        "ô": "o",
        "â": "a",
        "ê": "e",
        "î": "i",
        "Û": "U",
        "Ô": "O",
        "Â": "A",
        "Ê": "E",
        "Î": "I",
        "ü": "u",
        "ö": "o",
        "ä": "a",
        "ß": "ss",
        "ñ": "n",
        "ç": "c",
        "ø": "o",
        "å": "a",
        "æ": "ae",
        "œ": "oe",
        "ł": "l",
        "ř": "r",
        "š": "s",
        "ž": "z",
        "č": "c",
        "ć": "c",
        "đ": "d",
        "ť": "t",
        "ň": "n",
        "ý": "y",
        "ů": "u",
        "ě": "e",
    }
)


def ascii_fold(text: str | None) -> str:
    """Fold diacritics to ASCII for search / romanization comparison."""
    if not text:
        return ""
    s = text.translate(_DIACRITIC_MAP)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s


def normalize_character(raw: str | None) -> str | None:
    """Parse IMDb characters JSON-ish and normalize for matching."""
    if not raw:
        return None
    m = re.findall(r'"([^"]+)"', raw)
    name = m[0] if m else raw.strip().strip("[]")
    if not name:
        return None
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    # Drop leading "The " for matching The Joker / Joker
    folded = ascii_fold(name).lower().strip()
    if folded.startswith("the "):
        folded = folded[4:]
    return folded or None


def display_character(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.findall(r'"([^"]+)"', raw)
    name = m[0] if m else raw.strip().strip("[]")
    if not name:
        return None
    name = re.sub(r"\s*\(voice\)\s*", "", name, flags=re.I).strip()
    return name or None

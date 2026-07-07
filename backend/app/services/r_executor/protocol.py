r"""Parse the line-based JSON protocol R scripts stream over stdout.

R emits structured messages (progress, error, done, plot) as one JSON object per
line via ``jsonlite::toJSON``, but the surrounding log output is free text, so a
JSON object has to be located inside an otherwise unstructured line. A naive
``\{.*?\}`` regex breaks the moment an object contains nested braces (e.g.
``{"type":"progress","data":{"x":1}}``), silently truncating the payload. The
scanner below tracks brace depth while respecting string literals and escapes,
so nested objects are handled correctly.
"""

from __future__ import annotations

import json


def extract_json_objects(text: str) -> list[dict]:
    """Return every top-level JSON object embedded in ``text``.

    Only ``dict`` results are returned; bare arrays/scalars and malformed
    fragments are ignored. The scan never raises — unparseable candidates are
    skipped — so it is safe to call on arbitrary R log lines.
    """
    objects: list[dict] = []
    depth = 0
    start: int | None = None
    in_string = False
    escaped = False

    for i, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = i
            depth += 1
        elif char == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : i + 1]
                try:
                    parsed = json.loads(candidate)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, dict):
                    objects.append(parsed)
                start = None

    return objects

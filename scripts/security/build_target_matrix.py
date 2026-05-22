#!/usr/bin/env python3
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse


def normalize_url(value):
    value = value.strip()
    if not value:
        return ""
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
        value = f"https://{value}"
    return value.rstrip("/")


def slug_for(url):
    parsed = urlparse(url)
    host = parsed.netloc or parsed.path
    host = host.split("@")[-1].split(":")[0].lower()
    slug = re.sub(r"[^a-z0-9]+", "-", host).strip("-")
    return slug or "target"


def configured_targets():
    raw_input = os.environ.get("TARGET_URLS", "")
    if raw_input.strip():
        return re.split(r"[\n,]+", raw_input)

    config_path = Path("config/domains.txt")
    if not config_path.exists():
        return ["https://example.com"]

    return [
        line
        for line in config_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def unique_targets(values):
    seen_urls = set()
    seen_slugs = {}
    targets = []

    for value in values:
        url = normalize_url(value)
        if not url or url in seen_urls:
            continue

        seen_urls.add(url)
        base_slug = slug_for(url)
        slug = base_slug
        index = 2
        while slug in seen_slugs:
            slug = f"{base_slug}-{index}"
            index += 1
        seen_slugs[slug] = True
        targets.append({"url": url, "slug": slug})

    if not targets:
        targets.append({"url": "https://example.com", "slug": "example-com"})

    return targets


matrix = {"include": unique_targets(configured_targets())}
matrix_json = json.dumps(matrix, separators=(",", ":"))

output_path = os.environ.get("GITHUB_OUTPUT")
if output_path:
    with open(output_path, "a", encoding="utf-8") as output:
        output.write(f"matrix={matrix_json}\n")

matrix_file = os.environ.get("TARGET_MATRIX_FILE")
if matrix_file:
    Path(matrix_file).write_text(f"{matrix_json}\n", encoding="utf-8")

print(matrix_json)

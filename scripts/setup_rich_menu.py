#!/usr/bin/env python3
"""Create and set the まるのこし LINE rich menu using Messaging API.

Secrets are read from environment variables or the repository-local .dev.vars file.
The script is idempotent for the fixed menu name and never prints token values.
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = ROOT / "assets" / "rich-menu.png"
MENU_NAME = "mrnks-default-v1"
CHAT_BAR_TEXT = "まるのこしを開く"
WIDTH = 2500
HEIGHT = 843
MAX_IMAGE_BYTES = 1_000_000
API = "https://api.line.me/v2/bot"
DATA_API = "https://api-data.line.me/v2/bot"


def load_local_env() -> None:
    env_path = ROOT / ".dev.vars"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def png_dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"Expected a PNG image: {path}")
    return struct.unpack(">II", header[16:24])


def request(
    token: str,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
    binary_body: bytes | None = None,
    content_type: str | None = None,
) -> tuple[int, bytes, dict[str, str]]:
    headers = {"Authorization": f"Bearer {token}"}
    data: bytes | None = None
    if json_body is not None:
        data = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif binary_body is not None:
        data = binary_body
        if content_type:
            headers["Content-Type"] = content_type
    elif method in {"POST", "PUT"}:
        data = b""

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read(), dict(response.headers.items())
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LINE API {method} {url} failed: HTTP {error.code}: {body}") from error


def request_json(
    token: str,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _, body, _ = request(token, method, url, json_body=json_body)
    if not body:
        return {}
    parsed = json.loads(body)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"Unexpected LINE API response shape from {url}")
    return parsed


def image_is_uploaded(token: str, rich_menu_id: str) -> tuple[bool, int, str]:
    url = f"{DATA_API}/richmenu/{rich_menu_id}/content"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
            return True, len(body), response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False, 0, ""
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LINE API GET rich-menu image failed: HTTP {error.code}: {body}") from error


def delete_menu(token: str, rich_menu_id: str) -> None:
    request(token, "DELETE", f"{API}/richmenu/{rich_menu_id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=Path, default=DEFAULT_IMAGE)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_local_env()
    token = require_env("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN")
    liff_id = require_env("LINE_LIFF_ID")
    liff_url = f"https://liff.line.me/{liff_id}"

    image_path = args.image.resolve()
    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")
    width, height = png_dimensions(image_path)
    image_bytes = image_path.read_bytes()
    if (width, height) != (WIDTH, HEIGHT):
        raise SystemExit(f"Rich-menu image must be {WIDTH}x{HEIGHT}; got {width}x{height}")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise SystemExit(f"Rich-menu image exceeds 1 MB: {len(image_bytes)} bytes")

    payload: dict[str, Any] = {
        "size": {"width": WIDTH, "height": HEIGHT},
        "selected": True,
        "name": MENU_NAME,
        "chatBarText": CHAT_BAR_TEXT,
        "areas": [
            {
                "bounds": {"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT},
                "action": {
                    "type": "uri",
                    "label": "アルバムを開く",
                    "uri": liff_url,
                },
            }
        ],
    }

    if args.dry_run:
        safe_payload = json.loads(json.dumps(payload, ensure_ascii=False))
        safe_payload["areas"][0]["action"]["uri"] = "https://liff.line.me/[configured]"
        print(
            json.dumps(
                {
                    "dryRun": True,
                    "image": str(image_path.relative_to(ROOT)),
                    "imageBytes": len(image_bytes),
                    "payload": safe_payload,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    menu_list = request_json(token, "GET", f"{API}/richmenu/list").get("richmenus", [])
    matching = [menu for menu in menu_list if menu.get("name") == MENU_NAME]
    rich_menu_id: str | None = None
    created = False
    default_set = False

    if matching:
        menu = matching[0]
        area_uri = (((menu.get("areas") or [{}])[0].get("action") or {}).get("uri"))
        if area_uri != liff_url:
            raise SystemExit(f"Existing {MENU_NAME} points to a different URI; bump MENU_NAME before replacing it")
        rich_menu_id = str(menu["richMenuId"])
    else:
        result = request_json(token, "POST", f"{API}/richmenu", json_body=payload)
        rich_menu_id = str(result["richMenuId"])
        created = True

    try:
        uploaded, uploaded_bytes, uploaded_type = image_is_uploaded(token, rich_menu_id)
        if not uploaded:
            request(
                token,
                "POST",
                f"{DATA_API}/richmenu/{rich_menu_id}/content",
                binary_body=image_bytes,
                content_type="image/png",
            )
            uploaded, uploaded_bytes, uploaded_type = image_is_uploaded(token, rich_menu_id)
        if not uploaded:
            raise RuntimeError("Rich-menu image was not available after upload")

        request(token, "POST", f"{API}/user/all/richmenu/{rich_menu_id}")
        default_set = True

        default = request_json(token, "GET", f"{API}/user/all/richmenu")
        if default.get("richMenuId") != rich_menu_id:
            raise RuntimeError("Default rich menu verification failed")

        verified_menus = request_json(token, "GET", f"{API}/richmenu/list").get("richmenus", [])
        verified = next((menu for menu in verified_menus if menu.get("richMenuId") == rich_menu_id), None)
        if verified is None:
            raise RuntimeError("Created rich menu was not returned by the list API")
        verified_uri = (((verified.get("areas") or [{}])[0].get("action") or {}).get("uri"))
        if verified_uri != liff_url:
            raise RuntimeError("Rich-menu LIFF URI verification failed")

        print(
            json.dumps(
                {
                    "richMenuId": rich_menu_id,
                    "name": MENU_NAME,
                    "default": True,
                    "selected": verified.get("selected"),
                    "image": {
                        "contentType": uploaded_type,
                        "bytes": uploaded_bytes,
                        "dimensions": f"{WIDTH}x{HEIGHT}",
                    },
                    "action": "configured LIFF URL",
                    "reused": not created,
                },
                ensure_ascii=False,
            )
        )
    except Exception:
        if created and rich_menu_id and not default_set:
            try:
                delete_menu(token, rich_menu_id)
            except Exception as cleanup_error:
                print(f"Warning: failed to remove incomplete rich menu: {cleanup_error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()

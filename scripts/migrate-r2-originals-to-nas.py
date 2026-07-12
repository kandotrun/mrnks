#!/usr/bin/env python3
"""Copy verified R2 originals to NAS and atomically switch D1 metadata.

The default is a read-only plan. Pass --apply to copy every currently R2-backed
original, verify the NAS copy by reading it through the direct rclone remote,
and only then update all matching D1 rows in one transaction. R2 objects are
intentionally retained as rollback copies.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACCOUNT_ID = "ba88a8b00eb7e0bfe9a8f00e8eb83d56"
BUCKET = "mrnks-media"
DB_BINDING = "DB"


def run(command: list[str], *, env: dict[str, str], capture: bool = True, timeout: int = 600) -> str:
    completed = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        env=env,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        timeout=timeout,
    )
    return completed.stdout if capture else ""


def wrangler_json(sql: str, env: dict[str, str]) -> list[dict[str, Any]]:
    output = run(
        ["npx", "wrangler", "d1", "execute", DB_BINDING, "--remote", "--command", sql, "--json"],
        env=env,
    )
    payload = json.loads(output)
    return payload[0].get("results", []) if payload else []


def safe_storage_key(value: str) -> PurePosixPath:
    key = PurePosixPath(value)
    if key.is_absolute() or not key.parts or key.parts[0] != "originals":
        raise ValueError(f"unsafe storage key: {value!r}")
    if any(part in {"", ".", ".."} for part in key.parts):
        raise ValueError(f"unsafe storage key: {value!r}")
    return key


def digest_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def digest_remote(remote_path: str, env: dict[str, str]) -> tuple[int, str]:
    process = subprocess.Popen(
        ["rclone", "cat", remote_path],
        cwd=PROJECT_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    digest = hashlib.sha256()
    size = 0
    while chunk := process.stdout.read(1024 * 1024):
        size += len(chunk)
        digest.update(chunk)
    stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
    return_code = process.wait(timeout=600)
    if return_code != 0:
        raise RuntimeError(f"rclone cat failed for {remote_path}: {stderr.strip()}")
    return size, digest.hexdigest()


def copy_via_mount(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.migrate-{os.getpid()}.part")
    try:
        with source.open("rb") as reader, temporary.open("wb") as writer:
            shutil.copyfileobj(reader, writer, length=4 * 1024 * 1024)
            writer.flush()
            os.fsync(writer.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def wait_for_remote_verification(
    remote_path: str,
    expected_size: int,
    expected_hash: str,
    env: dict[str, str],
    timeout_seconds: int = 300,
) -> tuple[int, str]:
    deadline = time.monotonic() + timeout_seconds
    last_error = "not attempted"
    while time.monotonic() < deadline:
        try:
            size, sha256 = digest_remote(remote_path, env)
            if size == expected_size and sha256 == expected_hash:
                return size, sha256
            last_error = f"size={size}, sha256={sha256}"
        except Exception as error:  # retry while the VFS write-back reaches SMB
            last_error = str(error)
        time.sleep(2)
    raise RuntimeError(f"NAS verification timed out for {remote_path}: {last_error}")


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="perform copies and D1 switch")
    parser.add_argument("--account-id", default=DEFAULT_ACCOUNT_ID)
    parser.add_argument("--nas-root", type=Path, default=Path("/home/kan/UGREEN-NAS/Photos/mrnks"))
    parser.add_argument("--rclone-remote", default="kans-nas:Photos/mrnks")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    env = os.environ.copy()
    env["CLOUDFLARE_ACCOUNT_ID"] = args.account_id
    assets = wrangler_json(
        "SELECT id,family_id,original_filename,original_mime_type,original_size_bytes,"
        "original_sha256,original_storage_key FROM media_assets "
        "WHERE original_storage_backend='r2' ORDER BY uploaded_at,id;",
        env,
    )
    plan = {
        "mode": "apply" if args.apply else "dry-run",
        "assets": len(assets),
        "bytes": sum(int(asset["original_size_bytes"]) for asset in assets),
        "r2OriginalsRetained": True,
        "items": [],
    }
    for asset in assets:
        safe_storage_key(str(asset["original_storage_key"]))
        plan["items"].append(
            {
                "id": asset["id"],
                "filename": asset["original_filename"],
                "sizeBytes": int(asset["original_size_bytes"]),
                "sha256": asset["original_sha256"],
                "storageKey": asset["original_storage_key"],
            }
        )

    if not args.apply or not assets:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0

    args.nas_root.mkdir(parents=True, exist_ok=True)
    verified: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="mrnks-r2-migration-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for index, asset in enumerate(assets, start=1):
            key = safe_storage_key(str(asset["original_storage_key"]))
            expected_size = int(asset["original_size_bytes"])
            expected_hash = str(asset["original_sha256"])
            local_source = temporary_root / f"{index:03d}-{asset['id']}.bin"
            run(
                [
                    "npx",
                    "wrangler",
                    "r2",
                    "object",
                    "get",
                    f"{BUCKET}/{key.as_posix()}",
                    "--file",
                    str(local_source),
                    "--remote",
                ],
                env=env,
                timeout=600,
            )
            source_size, source_hash = digest_file(local_source)
            if source_size != expected_size or source_hash != expected_hash:
                raise RuntimeError(
                    f"R2 verification failed for {asset['id']}: "
                    f"size={source_size}/{expected_size}, sha256={source_hash}/{expected_hash}"
                )

            destination = args.nas_root.joinpath(*key.parts)
            copy_via_mount(local_source, destination)
            remote_path = f"{args.rclone_remote.rstrip('/')}/{key.as_posix()}"
            remote_size, remote_hash = wait_for_remote_verification(
                remote_path,
                expected_size,
                expected_hash,
                env,
            )
            verified.append(
                {
                    "id": asset["id"],
                    "storageKey": key.as_posix(),
                    "sizeBytes": remote_size,
                    "sha256": remote_hash,
                }
            )
            print(f"verified {index}/{len(assets)} {asset['id']} {remote_size} bytes", file=sys.stderr)

    predicates = []
    for asset in assets:
        predicates.append(
            f"(id={sql_quote(str(asset['id']))} "
            f"AND original_size_bytes={int(asset['original_size_bytes'])} "
            f"AND original_sha256={sql_quote(str(asset['original_sha256']))})"
        )
    statement = (
        "UPDATE media_assets SET original_storage_backend='nas' "
        "WHERE original_storage_backend='r2' AND (" + " OR ".join(predicates) + ");\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".sql", prefix="mrnks-d1-switch-", delete=False) as sql_file:
        sql_path = Path(sql_file.name)
        sql_file.write(statement)
    try:
        run(
            ["npx", "wrangler", "d1", "execute", DB_BINDING, "--remote", "--file", str(sql_path)],
            env=env,
            capture=False,
            timeout=600,
        )
    finally:
        sql_path.unlink(missing_ok=True)

    remaining = wrangler_json(
        "SELECT original_storage_backend AS backend,COUNT(*) AS assets,"
        "SUM(original_size_bytes) AS bytes FROM media_assets GROUP BY original_storage_backend;",
        env,
    )
    report = {
        **plan,
        "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "verified": verified,
        "databaseSummary": remaining,
    }
    report_path = args.report or PROJECT_ROOT / ".migration-reports" / (
        "r2-to-nas-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "report": str(report_path), "databaseSummary": remaining}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

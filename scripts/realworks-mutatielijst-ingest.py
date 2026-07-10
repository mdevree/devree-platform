#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.client
import json
import time
from datetime import datetime
from email import policy
from email.parser import BytesParser
from pathlib import Path

MAILDIR = Path("/home/DeVreeMakelaardij/mail/devreemakelaardij.nl/workflow")
ENV_FILE = Path("/home/DeVreeMakelaardij/stacks/devree-platform/.env")
STATE_FILE = Path("/home/DeVreeMakelaardij/.state/realworks-mutatielijst-ingest-processed.txt")
LOG_FILE = Path("/home/DeVreeMakelaardij/logs/realworks-mutatielijst-ingest.log")
PLATFORM_HOST = "127.0.0.1"
PLATFORM_PORT = 3100


def log(message: str) -> None:
    line = f"{datetime.now().isoformat(timespec='seconds')} {message}"
    print(line)
    with LOG_FILE.open("a") as handle:
        handle.write(line + "\n")


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in ENV_FILE.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key] = value.strip().strip('"').strip("'")
    return env


def load_processed() -> set[str]:
    if not STATE_FILE.exists():
        return set()
    return {line.strip() for line in STATE_FILE.read_text().splitlines() if line.strip()}


def mark_processed(message_id: str) -> None:
    with STATE_FILE.open("a") as handle:
        handle.write(message_id + "\n")


def candidate_files(include_cur: bool, days: int | None) -> list[Path]:
    dirs = [MAILDIR / "new"]
    if include_cur:
        dirs.append(MAILDIR / "cur")
    cutoff = time.time() - days * 24 * 60 * 60 if days else None
    files: list[Path] = []
    for directory in dirs:
        if not directory.exists():
            continue
        for path in directory.iterdir():
            if not path.is_file():
                continue
            if cutoff and path.stat().st_mtime < cutoff:
                continue
            files.append(path)
    return sorted(files, key=lambda item: item.stat().st_mtime)


def parse_mail(path: Path) -> dict[str, str] | None:
    msg = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
    subject = str(msg.get("Subject") or "")
    from_header = str(msg.get("From") or "")
    if "Mutatielijst overzicht" not in subject or "realworks.nl" not in from_header.lower():
        return None
    part = msg.get_body(preferencelist=("html", "plain"))
    return {
        "messageId": str(msg.get("Message-ID") or path.name).strip("<>"),
        "subject": subject,
        "date": str(msg.get("Date") or ""),
        "htmlBody": part.get_content() if part else "",
    }


def post_json(path: str, payload: dict, secret: str, timeout: int = 90) -> tuple[int, str]:
    body = json.dumps(payload).encode()
    conn = http.client.HTTPConnection(PLATFORM_HOST, PLATFORM_PORT, timeout=timeout)
    conn.request(
        "POST",
        path,
        body,
        headers={"content-type": "application/json", "x-webhook-secret": secret},
    )
    response = conn.getresponse()
    text = response.read().decode(errors="replace")
    return response.status, text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-cur", action="store_true")
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--enrich-limit", type=int, default=30)
    args = parser.parse_args()

    secret = load_env().get("N8N_WEBHOOK_SECRET")
    if not secret:
        log("ERROR missing N8N_WEBHOOK_SECRET")
        return 1

    processed = load_processed()
    ingested = 0
    skipped = 0
    failed = 0

    for path in candidate_files(args.include_cur, args.days):
        if ingested >= args.limit:
            break
        payload = parse_mail(path)
        if not payload:
            skipped += 1
            continue
        message_id = payload["messageId"]
        if message_id in processed:
            skipped += 1
            continue

        status, text = post_json("/api/realworks/object-mutations/ingest", payload, secret)
        if status == 200:
            ingested += 1
            mark_processed(message_id)
            log(f"ingested {message_id} {payload['subject']} {text[:300]}")
        else:
            failed += 1
            log(f"ERROR ingest failed {status} {message_id} {text[:500]}")

    if ingested:
        status, text = post_json(
            "/api/realworks/objects/enrich",
            {"limit": args.enrich_limit},
            secret,
            timeout=120,
        )
        log(f"enrich {status} {text[:500]}")

    status, text = post_json("/api/realworks/objects/cleanup", {"limit": 250}, secret)
    log(f"cleanup {status} {text[:500]}")
    log(f"done ingested={ingested} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

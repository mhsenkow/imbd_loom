"""Download IMDb non-commercial datasets with resume / skip-if-fresh."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)

from loom import IMDB_BASE, IMDB_FILES, RAW
from loom.db import ensure_dirs

console = Console()

# Skip re-download if file is newer than this many hours
FRESH_HOURS = 24


def _is_fresh(path: Path, hours: float = FRESH_HOURS) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    age = time.time() - path.stat().st_mtime
    return age < hours * 3600


def download_imdb(*, force: bool = False) -> None:
    ensure_dirs()
    console.print(f"[bold]Downloading IMDb datasets →[/bold] {RAW}")
    console.print(f"Source: {IMDB_BASE}  ({datetime.now(timezone.utc):%Y-%m-%d UTC})")

    with httpx.Client(follow_redirects=True, timeout=120.0) as client:
        for filename in IMDB_FILES:
            dest = RAW / filename
            if not force and _is_fresh(dest):
                console.print(f"  [dim]skip[/dim]  {filename} (fresh)")
                continue
            url = f"{IMDB_BASE}/{filename}"
            _download_one(client, url, dest)

    console.print("[green]✓[/green] Download complete")


def _download_one(client: httpx.Client, url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")

    headers: dict[str, str] = {}
    mode = "wb"
    resume_from = 0
    if partial.exists():
        resume_from = partial.stat().st_size
        headers["Range"] = f"bytes={resume_from}-"
        mode = "ab"

    with client.stream("GET", url, headers=headers) as resp:
        # If server ignores Range, restart
        if resume_from and resp.status_code == 200:
            mode = "wb"
            resume_from = 0
        resp.raise_for_status()

        total = None
        cl = resp.headers.get("content-length")
        if cl:
            total = int(cl) + resume_from

        with Progress(
            TextColumn("[bold blue]{task.fields[name]}"),
            BarColumn(),
            DownloadColumn(),
            TransferSpeedColumn(),
            TimeRemainingColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("dl", total=total, name=dest.name)
            if resume_from:
                progress.update(task, completed=resume_from)

            with open(partial, mode) as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                    f.write(chunk)
                    progress.update(task, advance=len(chunk))

    partial.replace(dest)
    console.print(f"  [green]got[/green]  {dest.name}  ({dest.stat().st_size / 1e6:.1f} MB)")

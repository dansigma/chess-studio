#!/usr/bin/env python3
"""Download November 2026 Lichess broadcast PGNs for HumanFish replication (resumable)."""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

TOURNAMENTS = [
    ("1. Bundesliga Austria 2026/2027", ["1. Bundesliga Austria 2026/2027", "Bundesliga Austria 2026"]),
    ("17th Hainan Danzhou GM Tournament 2026 | Blitz", ["17th Hainan Danzhou GM Tournament 2026", "Hainan Danzhou 2026"]),
    ("2026 Chinese Chess League Division A | Finals", ["2026 Chinese Chess League Division A", "Chinese Chess League 2026"]),
    ("35. ekipno prvenstvo Hrvatske 2026 (Croatian Team Championship) - 1. A HŠL", ["ekipno prvenstvo Hrvatske 2026", "Hrvatske 2026"]),
    ("Campeonato de España por Equipos de Club División de Honor", ["Campeonato de España por Equipos", "División de Honor 2026"]),
    ("FIDE World Chess Championship 2026", ["FIDE World Chess Championship 2026"]),
    ("FIDE World Junior Chess Championship 2026 | Open", ["FIDE World Junior Chess Championship 2026", "World Junior 2026"]),
    ("Jerusalem Masters 2026 | Round Robin", ["Jerusalem Masters 2026"]),
    ("Jerusalem Masters 2026 | Semifinal", ["Jerusalem Masters 2026"]),
    ("Ladder Legends by Lichess | GM Peng vs GM Salgado López", ["Ladder Legends by Lichess", "Salgado"]),
    ("London Chess Classic 2026: Masters", ["London Chess Classic 2026: Masters", "London Chess Classic 2026"]),
    ("Total Chess World Championship Tour Pilot 2026 | Finals", ["Total Chess World Championship Tour Pilot 2026", "Total Chess 2026"]),
    ("WR Women's Chess Tour 2026 - Grand Final | Rapid", ["WR Women's Chess Tour 2026", "WR Women"]),
]

USER_AGENT = "chess-benchmark/1.0"
DEFAULT_OUT_DIR = Path("/home/danilo/data/maia/humanfish-nov2026/raw")


def fetch_url(url: str, accept: str = "application/json", delay: float = 0.4) -> bytes:
    """Fetch a URL sequentially with generic User-Agent and 429 exponential backoff."""
    backoff = 2.0
    for attempt in range(7):
        time.sleep(delay)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": accept},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 or exc.code >= 500:
                retry_after = exc.headers.get("Retry-After")
                try:
                    wait = float(retry_after) if retry_after else backoff
                except ValueError:  # Retry-After may be an HTTP date
                    wait = backoff
                print(f"HTTP {exc.code} for {url}; sleeping {wait:.1f}s (attempt {attempt + 1})", flush=True)
                time.sleep(wait)
                backoff = min(backoff * 2, 60.0)
                continue
            raise
        except urllib.error.URLError as exc:
            print(f"URL error for {url}: {exc}; sleeping {backoff:.1f}s", flush=True)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60.0)
    raise RuntimeError(f"Failed to fetch {url} after retries")


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def pick_best_match(target: str, results: list[dict]) -> dict | None:
    """Pick the broadcast result matching the target tournament name."""
    target_norm = normalize_name(target)
    best = None
    best_score = -1.0
    for item in results:
        tour = item.get("tour", {})
        name = tour.get("name", "")
        name_norm = normalize_name(name)
        if name == target or name_norm == target_norm:
            return tour
        t_tokens = set(target_norm.split())
        n_tokens = set(name_norm.split())
        if not t_tokens or not n_tokens:
            continue
        overlap = len(t_tokens & n_tokens) / max(len(t_tokens), len(n_tokens))
        if target_norm in name_norm or name_norm in target_norm:
            overlap += 0.25
        if overlap > best_score:
            best_score = overlap
            best = tour
    if best is not None and best_score >= 0.55:
        return best
    return None


def search_tournament(target: str, queries: list[str]) -> dict | None:
    """Search Lichess broadcast API across fallback queries."""
    for q in queries:
        for page in (1, 2):
            url = f"https://lichess.org/api/broadcast/search?q={urllib.parse.quote(q)}&page={page}"
            data = json.loads(fetch_url(url).decode("utf-8"))
            results = data.get("currentPageResults", [])
            match = pick_best_match(target, results)
            if match is not None:
                return match
            if not data.get("nextPage"):
                break
    return None


def count_pgn_games(pgn_text: str) -> int:
    return sum(1 for line in pgn_text.splitlines() if line.startswith("[Event "))


def load_existing_by_query(out_dir: Path) -> dict[str, dict]:
    manifest_path = out_dir / "manifest.json"
    by_query: dict[str, dict] = {}
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        for entry in data.get("tournaments", []):
            by_query[entry["query_name"]] = entry
    # Also scan *.meta.json + *.pgn in case a previous run didn't write manifest.json
    for meta_path in out_dir.glob("*.meta.json"):
        tour_id = meta_path.name[:-len(".meta.json")]
        pgn_path = out_dir / f"{tour_id}.pgn"
        if not pgn_path.exists() or pgn_path.stat().st_size == 0:
            continue
        game_count = count_pgn_games(pgn_path.read_text(encoding="utf-8", errors="replace"))
        if game_count == 0:
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        tour = meta.get("tour", {})
        name = tour.get("name", "")
        for target_name, _ in TOURNAMENTS:
            if target_name in by_query and by_query[target_name].get("status") == "downloaded":
                continue
            if pick_best_match(target_name, [{"tour": tour}]) is not None:
                info = tour.get("info", {})
                by_query[target_name] = {
                    "query_name": target_name,
                    "id": tour_id,
                    "name": name,
                    "url": tour.get("url", f"https://lichess.org/broadcast/{tour.get('slug', '')}/{tour_id}"),
                    "fide_tc": info.get("fideTC"),
                    "tc": info.get("tc"),
                    "game_count": game_count,
                    "pgn_file": pgn_path.name,
                    "status": "downloaded",
                }
                break
    return by_query


def save_manifest(out_dir: Path, by_query: dict[str, dict]) -> None:
    entries = [by_query[t[0]] for t in TOURNAMENTS if t[0] in by_query]
    missing = [e["query_name"] for e in entries if e["status"] == "missing"]
    manifest = {
        "total_requested": len(TOURNAMENTS),
        "downloaded": sum(1 for e in entries if e["status"] == "downloaded"),
        "missing": missing,
        "tournaments": entries,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Download November 2026 Lichess broadcast PGNs")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--count", type=int, default=len(TOURNAMENTS))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    # Always start from the existing manifest so a --start/--count subset keeps the other entries.
    by_query = load_existing_by_query(out_dir)

    subset = TOURNAMENTS[args.start : args.start + args.count]
    for target_name, queries in subset:
        existing = by_query.get(target_name)
        if not args.force and existing and existing.get("status") == "downloaded":
            pgn_name = existing.get("pgn_file")
            pgn_file = out_dir / pgn_name if pgn_name else None
            if pgn_file is not None and pgn_file.is_file() and pgn_file.stat().st_size > 0:
                print(f"Skipping already downloaded: {target_name} ({existing['id']})", flush=True)
                continue

        print(f"Searching: {target_name}", flush=True)
        tour = search_tournament(target_name, queries)
        if tour is None:
            print(f"  MISSING on Lichess: {target_name}", flush=True)
            by_query[target_name] = {
                "query_name": target_name,
                "id": None,
                "name": None,
                "url": None,
                "fide_tc": None,
                "tc": None,
                "game_count": 0,
                "pgn_file": None,
                "status": "missing",
            }
            save_manifest(out_dir, by_query)
            continue

        tour_id = tour["id"]
        tour_name = tour["name"]
        tour_url = tour.get("url", f"https://lichess.org/broadcast/{tour.get('slug', '')}/{tour_id}")
        info = tour.get("info", {})
        print(f"  Found: {tour_id} | {tour_name} | fideTC={info.get('fideTC')} | tc={info.get('tc')}", flush=True)

        meta_path = out_dir / f"{tour_id}.meta.json"
        pgn_path = out_dir / f"{tour_id}.pgn"

        if meta_path.exists() and meta_path.stat().st_size > 0 and not args.force:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        else:
            meta_raw = fetch_url(f"https://lichess.org/api/broadcast/{tour_id}")
            meta_path.write_bytes(meta_raw)
            meta = json.loads(meta_raw.decode("utf-8"))

        pgn_bytes = fetch_url(
            f"https://lichess.org/api/broadcast/{tour_id}.pgn",
            accept="application/x-chess-pgn",
        )
        pgn_text = pgn_bytes.decode("utf-8", errors="replace")
        game_count = count_pgn_games(pgn_text)
        if game_count == 0 and meta.get("rounds"):
            parts = []
            for rnd in meta["rounds"]:
                rnd_id = rnd["id"]
                rnd_pgn = fetch_url(
                    f"https://lichess.org/api/broadcast/round/{rnd_id}.pgn",
                    accept="application/x-chess-pgn",
                ).decode("utf-8", errors="replace")
                if rnd_pgn.strip():
                    parts.append(rnd_pgn)
            pgn_text = "\n\n".join(parts)
            game_count = count_pgn_games(pgn_text)

        if game_count == 0:
            raise RuntimeError(f"Broadcast {tour_id} ({tour_name}) returned no games")
        pgn_path.write_text(pgn_text, encoding="utf-8")
        print(f"  Saved {game_count} games -> {pgn_path.name}", flush=True)

        by_query[target_name] = {
            "query_name": target_name,
            "id": tour_id,
            "name": tour_name,
            "url": tour_url,
            "fide_tc": info.get("fideTC") or meta.get("tour", {}).get("info", {}).get("fideTC"),
            "tc": info.get("tc") or meta.get("tour", {}).get("info", {}).get("tc"),
            "game_count": game_count,
            "pgn_file": pgn_path.name,
            "status": "downloaded",
        }
        save_manifest(out_dir, by_query)

    save_manifest(out_dir, by_query)
    manifest = json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))
    print(f"Manifest updated: {manifest['downloaded']}/{manifest['total_requested']} downloaded, missing={manifest['missing']}")


if __name__ == "__main__":
    main()

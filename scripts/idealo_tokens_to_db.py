#!/usr/bin/env python3
"""Upload an idealo OAuth token file (same JSON as .idealo_tokens.json) to Postgres for Vercel.

Usage: DATABASE_URL=... python scripts/idealo_tokens_to_db.py path/to/tokens.json
       (or put DATABASE_URL in .env.local; `vercel env pull` writes it there)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import dotenv_values  # noqa: E402

from cleanbreak.db.kv import KvStore  # noqa: E402
from cleanbreak.idealo.auth import DB_TOKEN_KEY, _login_usable  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if not _login_usable(data):
        sys.exit("Token file has no live access token and no refresh token + client_info.")
    url = os.getenv("DATABASE_URL") or dotenv_values(ROOT / ".env.local").get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set (env or .env.local).")
    KvStore(url).set(DB_TOKEN_KEY, {"client_info": data["client_info"], "tokens": data["tokens"]})
    print("idealo login stored in Postgres (key: %s)." % DB_TOKEN_KEY)


if __name__ == "__main__":
    main()

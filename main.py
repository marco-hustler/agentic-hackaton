"""Vercel entrypoint: the FastAPI app lives in src/cleanbreak/api/app.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from cleanbreak.api.app import app  # noqa: E402

__all__ = ["app"]

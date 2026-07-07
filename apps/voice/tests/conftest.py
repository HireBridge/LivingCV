"""Voice service test conftest — add src/ to sys.path so `import voice_service`
resolves when pytest is run from the apps/voice directory."""

from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

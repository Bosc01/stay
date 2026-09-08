"""Logging setup.

Application code uses `logging.getLogger(__name__)` and never `print`, so that
severity is filterable, output carries timestamps, and a noisy path can be
turned down without editing code. Set LOG_LEVEL=DEBUG for verbose local runs.

Owner data stays out of logs at INFO. Intake text, the dog's name, and model
output are the owner's, and Railway retains stdout. Detail that helps debugging
is logged when something actually fails, not on every healthy request.
"""

import logging
import os

_CONFIGURED = False


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level_name, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _CONFIGURED = True

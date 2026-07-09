"""Application-wide logging configuration."""

import logging
import os
import sys


def setup_logging():
    """Configure root logging from the ``LOG_LEVEL`` environment variable.

    Formats records to stdout and quietens noisy third-party loggers. Defaults to
    DEBUG when ``LOG_LEVEL`` is unset, and falls back to INFO for an unknown level.
    """
    log_format = "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) -> %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    env_level = os.getenv("LOG_LEVEL", "DEBUG").upper()
    log_level = getattr(logging, env_level, logging.INFO)

    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt=date_format,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )

    # Reduce the noise from chatty third-party libraries.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

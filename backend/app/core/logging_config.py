import logging
import os
import sys

def setup_logging():
    log_format = "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) -> %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    # Dynamisches Log-Level aus .env / Umgebungsvariable (Default: INFO für Production)
    env_level = os.getenv("LOG_LEVEL", "DEBUG").upper()
    log_level = getattr(logging, env_level, logging.INFO)

    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt=date_format,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True
    )
    
    # Rauschen von geschwätzigen Drittanbieter-Bibliotheken minimieren
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
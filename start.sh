#!/bin/sh
# Launch the local backend with the Python standard library.
set -eu
cd "$(dirname "$0")"

if [ -x .venv/bin/python ]; then
  exec .venv/bin/python backend/app.py
fi
exec python3 backend/app.py

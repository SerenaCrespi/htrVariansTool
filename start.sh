#!/bin/sh
# Linux developer launcher. Creates an isolated CPU environment on first run,
# installs the project requirements, then starts the local backend.
set -eu
cd "$(dirname "$0")"

VENV_PYTHON=".venv/bin/python"

# Bertalign 2.0.1 requires Python 3.12+. Prefer an explicit python3.12 binary
# when available; otherwise check the default python3 before creating the venv.
if [ ! -x "$VENV_PYTHON" ]; then
  if command -v python3.12 >/dev/null 2>&1; then
    BASE_PYTHON="python3.12"
  elif command -v python3 >/dev/null 2>&1; then
    BASE_PYTHON="python3"
  else
    echo "Python 3.12 or newer is required to create the Bertalign environment."
    exit 1
  fi

  if ! "$BASE_PYTHON" -c 'import sys; raise SystemExit(sys.version_info < (3, 12))'; then
    echo "Bertalign requires Python 3.12 or newer. Install Python 3.12 and retry."
    exit 1
  fi

  echo "Creating the project environment in .venv …"
  "$BASE_PYTHON" -m venv .venv
fi

# The standard PyPI PyTorch build can pull large CUDA libraries on Linux.
# Install the official CPU wheel first; requirements.txt will then reuse it.
if ! "$VENV_PYTHON" -c 'import bertalign' >/dev/null 2>&1; then
  echo "Installing Bertalign and its CPU dependencies (first launch only) …"
  "$VENV_PYTHON" -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch>=2.2.0'
  "$VENV_PYTHON" -m pip install -r requirements.txt
fi

echo "Starting the collation workspace with: $VENV_PYTHON"
exec "$VENV_PYTHON" backend/app.py

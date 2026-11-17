#!/bin/sh
# Compatibility entry point: resolve the project directory, then delegate setup to start.sh.
cd "$(dirname "$0")"
exec sh start.sh

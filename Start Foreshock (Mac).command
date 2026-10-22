#!/bin/bash
# Double-click this file to start Foreshock on a Mac.
cd "$(dirname "$0")" || exit 1
clear
echo "Starting Foreshock…"
if ! command -v python3 >/dev/null 2>&1; then
  echo ""
  echo "Python 3 isn't installed yet."
  echo "Install it from https://www.python.org/downloads/ , then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
  echo "Your Python is too old. Foreshock needs Python 3.8 or newer: https://www.python.org/downloads/"
  read -r -p "Press Enter to close."
  exit 1
fi
python3 server/server.py "$@"
echo ""
read -r -p "Foreshock stopped. Press Enter to close this window."

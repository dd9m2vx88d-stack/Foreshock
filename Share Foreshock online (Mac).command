#!/bin/bash
# Double-click to start Foreshock with a temporary public link (needs cloudflared: brew install cloudflared).
cd "$(dirname "$0")" || exit 1
exec "./Start Foreshock (Mac).command" --share

@echo off
rem Double-click to start Foreshock with a temporary public link (needs cloudflared: winget install Cloudflare.cloudflared).
cd /d "%~dp0"
call "Start Foreshock (Windows).bat" --share

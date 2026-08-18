#!/bin/bash
# Run FlowSpeak in development: starts the Vite UI server + the app with hot reload.
# The app loads its UI from the dev server, so the pill actually renders.
set -e
cd "$(dirname "$0")"
exec ui/node_modules/.bin/tauri dev "$@"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ENV_TEMPLATE="$ROOT_DIR/sample.env"
FRONTEND_ENV="$ROOT_DIR/.env"
BACKEND_ENV_TEMPLATE="$ROOT_DIR/backend/sample.env"
BACKEND_ENV="$ROOT_DIR/backend/.env"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install a supported Node.js LTS version first."
  exit 1
fi

if [[ ! -f "$FRONTEND_ENV_TEMPLATE" || ! -f "$BACKEND_ENV_TEMPLATE" ]]; then
  echo "Environment templates are missing. Expected:"
  echo "  $FRONTEND_ENV_TEMPLATE"
  echo "  $BACKEND_ENV_TEMPLATE"
  exit 1
fi

# Never overwrite a developer's existing local environment files.
if [[ ! -f "$FRONTEND_ENV" ]]; then
  cp "$FRONTEND_ENV_TEMPLATE" "$FRONTEND_ENV"
  echo "Created .env from sample.env"
fi

if [[ ! -f "$BACKEND_ENV" ]]; then
  cp "$BACKEND_ENV_TEMPLATE" "$BACKEND_ENV"
  echo "Created backend/.env from backend/sample.env"
fi

echo
echo "Environment files:"
echo "  Frontend: $FRONTEND_ENV"
echo "  Backend:  $BACKEND_ENV"
echo
echo "Before first run, add your credentials to the sample files, then remove the generated .env files"
echo "if you want this script to copy the updated templates. Existing .env files are never overwritten."
echo

# Install dependencies once when needed.
if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm install
fi

if [[ ! -d "$ROOT_DIR/backend/node_modules" ]]; then
  echo "Installing backend dependencies..."
  npm --prefix "$ROOT_DIR/backend" install
fi

BACKEND_CMD="cd '$ROOT_DIR/backend' && npm run dev"
FRONTEND_CMD="cd '$ROOT_DIR' && npm run start"

open_macos_terminal() {
  local command="$1"
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "$command"
end tell
APPLESCRIPT
}

open_linux_terminal() {
  local command="$1"
  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash -lc "$command; exec bash"
  elif command -v konsole >/dev/null 2>&1; then
    konsole -e bash -lc "$command; exec bash" &
  elif command -v xterm >/dev/null 2>&1; then
    xterm -e bash -lc "$command; exec bash" &
  else
    return 1
  fi
}

case "$(uname -s)" in
  Darwin)
    open_macos_terminal "$BACKEND_CMD"
    open_macos_terminal "$FRONTEND_CMD"
    ;;
  Linux)
    if ! open_linux_terminal "$BACKEND_CMD"; then
      echo "No supported terminal emulator found (gnome-terminal, konsole, or xterm)."
      echo "Start these in separate terminals:"
      echo "  cd '$ROOT_DIR/backend' && npm run dev"
      echo "  cd '$ROOT_DIR' && npm run start"
      exit 1
    fi
    if ! open_linux_terminal "$FRONTEND_CMD"; then
      echo "Could not open the frontend terminal. Start it manually:"
      echo "  cd '$ROOT_DIR' && npm run start"
      exit 1
    fi
    ;;
  *)
    echo "Automatic two-terminal startup is not configured for this OS."
    echo "Open two terminals and run:"
    echo "  cd '$ROOT_DIR/backend' && npm run dev"
    echo "  cd '$ROOT_DIR' && npm run start"
    exit 1
    ;;
esac

echo "Backend and frontend startup commands were sent to separate terminals."

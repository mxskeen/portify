#!/usr/bin/env bash
# ==============================================================================
#  Portify — 1-Command Installer for Linux & macOS
#  https://github.com/mxskeen/portify
# ==============================================================================

set -e

REPO="mxskeen/portify"
APP_NAME="Portify"
BINARY_NAME="portify"

# Colors
BOLD='\033[1m'
GREEN='\033[32m'
SKY='\033[36m'
AMBER='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo -e "${SKY}${BOLD}"
echo "    ____             __  _ ____       "
echo "   / __ \____  _____/ /_(_) __/_  __ "
echo "  / /_/ / __ \/ ___/ __/ / /_/ / / / "
echo " / ____/ /_/ / /  / /_/ / __/ /_/ /  "
echo "/_/    \____/_/   \__/_/_/  \__, /   "
echo "                           /____/    "
echo -e "${RESET}"
echo -e "${BOLD}Local Server & Port Dashboard for Developers${RESET}\n"

# 1. Detect OS & Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)
    PLATFORM="linux"
    ;;
  Darwin*)
    PLATFORM="mac"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="windows"
    echo -e "${AMBER}Detected Windows.${RESET} Please install Portify using the Windows installer or run:"
    echo -e "  ${SKY}irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex${RESET}"
    exit 0
    ;;
  *)
    echo -e "${RED}Unsupported operating system: $OS${RESET}"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    ARCH_NAME="x64"
    ;;
  aarch64|arm64)
    ARCH_NAME="arm64"
    ;;
  *)
    ARCH_NAME="x64"
    ;;
esac

echo -e "Detected: ${BOLD}${PLATFORM} (${ARCH_NAME})${RESET}"

# 2. Setup directories
INSTALL_DIR="${HOME}/.local/share/portify"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"

# 3. Fetch latest release information from GitHub API
echo -e "\n${SKY}→${RESET} Checking latest Portify release from GitHub..."

LATEST_RELEASE_JSON=""
if command -v curl >/dev/null 2>&1; then
  LATEST_RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)
elif command -v wget >/dev/null 2>&1; then
  LATEST_RELEASE_JSON=$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)
fi

DOWNLOAD_URL=""
TAG_NAME="latest"

if [ -n "$LATEST_RELEASE_JSON" ]; then
  # Parse tag
  TAG_NAME=$(echo "$LATEST_RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 || echo "latest")
  
  # Find download URL for AppImage or zip
  if [ "$PLATFORM" = "linux" ]; then
    DOWNLOAD_URL=$(echo "$LATEST_RELEASE_JSON" | grep -o 'https://[^"]*\.AppImage' | head -1 || true)
  elif [ "$PLATFORM" = "mac" ]; then
    DOWNLOAD_URL=$(echo "$LATEST_RELEASE_JSON" | grep -o 'https://[^"]*\.dmg' | head -1 || true)
  fi
fi

TARGET_FILE="$INSTALL_DIR/Portify.AppImage"

if [ -n "$DOWNLOAD_URL" ]; then
  echo -e "${SKY}→${RESET} Downloading Portify ${BOLD}${TAG_NAME}${RESET}..."
  if command -v curl >/dev/null 2>&1; then
    curl -# -L -o "$TARGET_FILE" "$DOWNLOAD_URL"
  else
    wget --progress=bar:force -O "$TARGET_FILE" "$DOWNLOAD_URL"
  fi
else
  # If release binaries don't exist yet, build from source automatically
  echo -e "${AMBER}!${RESET} No pre-built release binary found for ${PLATFORM}. Building from source..."
  if command -v git >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    TMP_DIR="$(mktemp -d)"
    git clone --depth 1 "https://github.com/${REPO}.git" "$TMP_DIR"
    cd "$TMP_DIR"
    npm install
    npm run build
    npx electron-builder --linux AppImage
    mv dist-electron/*.AppImage "$TARGET_FILE"
    cd "$HOME"
    rm -rf "$TMP_DIR"
  else
    echo -e "${RED}Error: Neither release binary nor git/npm available to install Portify.${RESET}"
    exit 1
  fi
fi

chmod +x "$TARGET_FILE"

# 4. Create symlink in ~/.local/bin
ln -sf "$TARGET_FILE" "$BIN_DIR/portify"

# 5. Download icon and create .desktop entry for Linux
if [ "$PLATFORM" = "linux" ]; then
  ICON_PATH="$ICON_DIR/portify.png"
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/public/icon.png" -o "$ICON_PATH" 2>/dev/null || true
  if [ ! -f "$ICON_PATH" ] && [ -f "$INSTALL_DIR/icon.png" ]; then
    ICON_PATH="$INSTALL_DIR/icon.png"
  fi

  cat > "$DESKTOP_DIR/portify.desktop" <<EOF
[Desktop Entry]
Name=Portify
GenericName=Port & Server Dashboard
Comment=Local Server & Port Dashboard for Developers
Exec=$BIN_DIR/portify %U
Terminal=false
Type=Application
Icon=$ICON_PATH
Categories=Development;Utility;
Keywords=ports;docker;tunnel;cloudflare;server;
StartupNotify=true
StartupWMClass=Portify
EOF
  chmod +x "$DESKTOP_DIR/portify.desktop"

  # Update desktop database if available
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  fi
fi

# 6. Ensure ~/.local/bin is in PATH notice
SHELL_CONFIG=""
case "$SHELL" in
  */zsh) SHELL_CONFIG="$HOME/.zshrc" ;;
  */bash) SHELL_CONFIG="$HOME/.bashrc" ;;
esac

echo -e "\n${GREEN}✓ Portify successfully installed!${RESET}"
echo -e "  Location: ${BOLD}$BIN_DIR/portify${RESET}"
echo -e "  Launcher: ${BOLD}Available in your Application Menu${RESET}"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo -e "\n${AMBER}Notice:${RESET} Add ${BOLD}~/.local/bin${RESET} to your PATH to run 'portify' directly from terminal:"
  if [ -n "$SHELL_CONFIG" ]; then
    echo -e "  ${SKY}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> $SHELL_CONFIG${RESET}"
    echo -e "  ${SKY}source $SHELL_CONFIG${RESET}"
  fi
fi

echo -e "\n${SKY}Starting Portify...${RESET}"
nohup "$BIN_DIR/portify" >/dev/null 2>&1 &
echo -e "${GREEN}Done!${RESET}\n"

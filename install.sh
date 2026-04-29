#!/usr/bin/env bash
set -euo pipefail

REPO="SeaVerseAI/sea-cli"
VERSION="0.1.0"
TAG="v${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

detect_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)
      case "$arch" in
        arm64) printf 'darwin-arm64' ;;
        x86_64) printf 'darwin-x64' ;;
        *) fail "Unsupported macOS architecture: $arch" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64|amd64) printf 'linux-x64' ;;
        *) fail "Unsupported Linux architecture: $arch" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*)
      case "$arch" in
        x86_64|amd64) printf 'windows-x64.exe' ;;
        *) fail "Unsupported Windows architecture: $arch" ;;
      esac
      ;;
    *)
      fail "Unsupported operating system: $os"
      ;;
  esac
}

download() {
  local url output
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  fail "Either curl or wget is required."
}

try_download() {
  local url output
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return $?
  fi

  return 1
}

verify_checksum() {
  local file checksum_file expected actual
  file="$1"
  checksum_file="$2"

  expected="$(awk '{print $1}' "$checksum_file")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  else
    log "Checksum tools not found; skipping checksum verification."
    return
  fi

  [ "$expected" = "$actual" ] || fail "Checksum mismatch for $(basename "$file")"
}

extract_gzip() {
  local archive output
  archive="$1"
  output="$2"

  if has_cmd gunzip; then
    gunzip -c "$archive" > "$output"
    return
  fi

  if has_cmd gzip; then
    gzip -dc "$archive" > "$output"
    return
  fi

  fail "No gzip-compatible extractor found."
}

extract_zip_windows() {
  local archive output
  archive="$1"
  output="$2"

  if has_cmd powershell.exe; then
    powershell.exe -NoProfile -Command \
      "Expand-Archive -LiteralPath '$archive' -DestinationPath '$(dirname "$output")' -Force" >/dev/null
    mv "$(dirname "$output")/$(basename "$output")" "$output" 2>/dev/null || true
    return
  fi

  if has_cmd powershell; then
    powershell -NoProfile -Command \
      "Expand-Archive -LiteralPath '$archive' -DestinationPath '$(dirname "$output")' -Force" >/dev/null
    mv "$(dirname "$output")/$(basename "$output")" "$output" 2>/dev/null || true
    return
  fi

  fail "No built-in ZIP extractor found on Windows."
}

main() {
  local suffix asset asset_url checksum_url compressed_asset compressed_url compressed_checksum_url
  local tmpdir install_dir binary_name dest archive_path binary_path use_compressed
  need_cmd uname
  suffix="$(detect_target)"

  if [[ "$suffix" == *.exe ]]; then
    asset="sac-${VERSION}-${suffix}"
    binary_name="sac.exe"
    compressed_asset="${asset}.zip"
    use_compressed=0
    if has_cmd powershell.exe || has_cmd powershell; then
      use_compressed=1
    fi
  else
    asset="sac-${VERSION}-${suffix}"
    binary_name="sac"
    compressed_asset="${asset}.gz"
    use_compressed=0
    if has_cmd gunzip || has_cmd gzip; then
      use_compressed=1
    fi
  fi

  asset_url="https://github.com/${REPO}/releases/download/${TAG}/${asset}"
  checksum_url="${asset_url}.sha256"
  compressed_url="https://github.com/${REPO}/releases/download/${TAG}/${compressed_asset}"
  compressed_checksum_url="${compressed_url}.sha256"
  tmpdir="$(mktemp -d)"
  trap '[[ -n "${tmpdir:-}" ]] && rm -rf "$tmpdir" 2>/dev/null || true' EXIT

  if [[ "$use_compressed" -eq 1 ]]; then
    archive_path="$tmpdir/$compressed_asset"
    log "Trying compressed asset ${compressed_asset} from ${REPO} ${TAG}"
    if try_download "$compressed_url" "$archive_path" \
      && try_download "$compressed_checksum_url" "$archive_path.sha256"; then
      verify_checksum "$archive_path" "$archive_path.sha256"
      binary_path="$tmpdir/$asset"
      if [[ "$suffix" == *.exe ]]; then
        extract_zip_windows "$archive_path" "$binary_path"
      else
        extract_gzip "$archive_path" "$binary_path"
      fi
      rm -f "$archive_path" "$archive_path.sha256"
    else
      log "Compressed asset unavailable, falling back to raw binary."
      use_compressed=0
    fi
  fi

  if [[ "$use_compressed" -eq 0 ]]; then
    binary_path="$tmpdir/$asset"
    log "Downloading raw asset ${asset} from ${REPO} ${TAG}"
    download "$asset_url" "$binary_path"
    download "$checksum_url" "$binary_path.sha256"
    verify_checksum "$binary_path" "$binary_path.sha256"
    rm -f "$binary_path.sha256"
  fi

  install_dir="${SAC_INSTALL_DIR:-$HOME/.local/bin}"
  if ! mkdir -p "$install_dir" 2>/dev/null; then
    fail "Cannot write to $install_dir. Use a writable user directory, or explicitly choose a privileged directory yourself via SAC_INSTALL_DIR."
  fi
  dest="$install_dir/$binary_name"
  if ! cp "$binary_path" "$dest" 2>/dev/null; then
    fail "Cannot install to $dest. Choose a writable install directory, or explicitly rerun with the privileges you want."
  fi
  chmod +x "$dest"
  printf '%s\n' "$dest" > "$SCRIPT_DIR/.sac-bin-path"
  printf 'export PATH="%s:$PATH"\n' "$install_dir" > "$SCRIPT_DIR/.sac-env"

  log "Installed to $dest"

  # Persist install_dir to shell rc files so sac survives new shell sessions
  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *)
      local export_line="export PATH=\"${install_dir}:\$PATH\""
      local marker="# added by sac installer"
      local rc_files=()
      local current_shell
      current_shell="$(basename "${SHELL:-sh}")"
      local os_type
      os_type="$(uname -s)"

      case "$current_shell" in
        zsh)
          [[ -f "$HOME/.zshrc" ]]    && rc_files+=("$HOME/.zshrc")
          [[ -f "$HOME/.zprofile" ]] && rc_files+=("$HOME/.zprofile")
          ;;
        bash)
          [[ -f "$HOME/.bashrc" ]]       && rc_files+=("$HOME/.bashrc")
          [[ -f "$HOME/.bash_profile" ]] && rc_files+=("$HOME/.bash_profile")
          [[ -f "$HOME/.profile" ]]      && rc_files+=("$HOME/.profile")
          ;;
        *)
          [[ -f "$HOME/.profile" ]] && rc_files+=("$HOME/.profile")
          ;;
      esac

      [[ ${#rc_files[@]} -eq 0 ]] && rc_files+=("$HOME/.profile")

      local wrote_any=0
      for rc in "${rc_files[@]}"; do
        if grep -qF "$install_dir" "$rc" 2>/dev/null; then
          continue
        fi
        printf '\n%s\n%s\n' "$marker" "$export_line" >> "$rc"
        wrote_any=1
      done
      [[ "$wrote_any" -eq 1 ]] && log "To use sac in this session: export PATH=\"${install_dir}:\$PATH\""

      # On Windows (Git Bash / MSYS2 / Cygwin), also register via setx so
      # CMD and PowerShell pick up the directory in new windows.
      case "$os_type" in
        MINGW*|MSYS*|CYGWIN*)
          local win_dir
          win_dir="$(cygpath -w "$install_dir" 2>/dev/null || echo "$install_dir")"
          if has_cmd setx; then
            local current_win_path
            current_win_path="$(cmd.exe /c 'echo %PATH%' 2>/dev/null || true)"
            case "$current_win_path" in
              *"$win_dir"*) ;;
              *) setx PATH "%PATH%;${win_dir}" > /dev/null 2>&1 || true ;;
            esac
          fi
          ;;
      esac
      ;;
  esac
}

main "$@"

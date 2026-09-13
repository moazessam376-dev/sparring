#!/usr/bin/env bash
set -euo pipefail

repository="moazessam376-dev/sparring"
release_api="https://api.github.com/repos/${repository}/releases/latest"
checksum_name="SHA256SUMS.txt"

die() {
  printf 'Sparring installer: %s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" -eq 0 ]; then
  die 'do not run as root; this installer does not elevate privileges'
fi

case "$(uname -s)" in
  Darwin)
    platform="macOS"
    case "$(uname -m)" in
      arm64|aarch64) artifact="Sparring-macos-arm64.app.tar.gz" ;;
      x86_64|amd64) artifact="Sparring-macos-x86_64.app.tar.gz" ;;
      *) die "no macOS release is available for architecture $(uname -m)" ;;
    esac
    ;;
  Linux)
    platform="Linux"
    case "$(uname -m)" in
      x86_64|amd64) artifact="Sparring-linux-x86_64.AppImage" ;;
      *) die "no Linux release is available for architecture $(uname -m)" ;;
    esac
    ;;
  *)
    die "this installer supports macOS and Linux only; use scripts/install.ps1 on Windows"
    ;;
esac

home_dir=${HOME:-}
[ -n "$home_dir" ] || die 'HOME is not set'

temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/sparring-install.XXXXXX")
trap 'rm -rf "$temporary_dir"' EXIT
release_json="$temporary_dir/release.json"

printf '%s\n' "Sparring installer" "Platform: ${platform}" "Architecture: $(uname -m)"
printf '%s\n' 'Reading the latest GitHub release.'
curl --fail --silent --show-error --location --retry 3 \
  --header 'Accept: application/vnd.github+json' \
  --header 'User-Agent: sparring-installer' \
  "$release_api" > "$release_json" || die 'could not read the latest GitHub release'

release_tag=$(sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' "$release_json" | head -n 1)
[ -n "$release_tag" ] || die 'the latest GitHub release did not contain a tag'

asset_url() {
  local wanted=$1
  awk -v wanted="$wanted" '
    /"name"[[:space:]]*:/ {
      name = $0
      sub(/.*"name"[[:space:]]*:[[:space:]]*"/, "", name)
      sub(/".*/, "", name)
    }
    /"browser_download_url"[[:space:]]*:/ && name == wanted {
      url = $0
      sub(/.*"browser_download_url"[[:space:]]*:[[:space:]]*"/, "", url)
      sub(/".*/, "", url)
      print url
      exit
    }
  ' "$release_json"
}

case "$artifact" in
  *.app.tar.gz) install_kind=macOS ;;
  *.AppImage) install_kind=Linux ;;
  *) die "unsupported release artifact $artifact" ;;
esac

download_url=$(asset_url "$artifact")
checksum_url=$(asset_url "$checksum_name")
[ -n "$download_url" ] || die "release $release_tag does not contain $artifact"
[ -n "$checksum_url" ] || die "release $release_tag does not contain $checksum_name"

case "$download_url" in
  "https://github.com/${repository}/releases/download/"*) ;;
  *) die "the release returned an unexpected download URL" ;;
esac
case "$checksum_url" in
  "https://github.com/${repository}/releases/download/"*) ;;
  *) die "the checksum returned an unexpected download URL" ;;
esac

artifact_path="$temporary_dir/$artifact"
checksum_path="$temporary_dir/$checksum_name"
printf '%s\n' "Release: ${release_tag}" "Downloading: ${artifact}"
curl --fail --silent --show-error --location --retry 3 \
  --header 'User-Agent: sparring-installer' "$download_url" > "$artifact_path" || die "could not download $artifact"
printf '%s\n' "Downloading: ${checksum_name}"
curl --fail --silent --show-error --location --retry 3 \
  --header 'User-Agent: sparring-installer' "$checksum_url" > "$checksum_path" || die "could not download $checksum_name"

expected=$(awk -v wanted="$artifact" '$2 == wanted { print $1; exit }' "$checksum_path")
[ -n "$expected" ] || die "the checksum file did not contain $artifact"
if [ "${#expected}" -ne 64 ] || [ -n "$(printf '%s' "$expected" | tr -d '0123456789abcdefABCDEF')" ]; then
  die "the checksum for $artifact was malformed"
fi

if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$artifact_path" | awk '{ print $1 }')
elif command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$artifact_path" | awk '{ print $1 }')
else
  die 'neither shasum nor sha256sum is available to verify the download'
fi

if [ "$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')" ]; then
  die "checksum verification failed for $artifact; nothing was installed"
fi
printf '%s\n' "Checksum verified: ${artifact}"

if [ "$install_kind" = macOS ]; then
  destination='/Applications/Sparring.app'
  [ -d /Applications ] || die '/Applications does not exist'
  [ -w /Applications ] || die '/Applications is not writable; run as a user who can write there (this installer does not elevate privileges)'

  extracted="$temporary_dir/extracted"
  mkdir -p "$extracted"
  while IFS= read -r member; do
    case "$member" in
      /*|../*|*/../*|..|*/..)
        die 'the macOS archive contained an unsafe path'
        ;;
    esac
  done < <(tar -tzf "$artifact_path")
  tar -xzf "$artifact_path" -C "$extracted" || die 'could not unpack the macOS application'
  app_path="$extracted/Sparring.app"
  [ -d "$app_path" ] || die 'the macOS archive did not contain Sparring.app'
  if [ -e "$destination" ]; then
    printf '%s\n' "Replacing: ${destination}"
    rm -rf "$destination"
  fi
  ditto "$app_path" "$destination" || die 'could not copy Sparring.app into /Applications'
  printf '%s\n' "Installed: ${destination}" 'Open Sparring from /Applications.'
else
  bin_dir="$home_dir/.local/bin"
  applications_dir="$home_dir/.local/share/applications"
  binary_path="$bin_dir/sparring"
  desktop_path="$applications_dir/sparring.desktop"
  mkdir -p "$bin_dir" "$applications_dir"
  cp "$artifact_path" "$binary_path" || die "could not copy the AppImage to $binary_path"
  chmod 0755 "$binary_path" || die "could not make $binary_path executable"
  cat > "$desktop_path" <<EOF
[Desktop Entry]
Name=Sparring
Comment=Sparring for engineers who build with agents
Exec=$binary_path
Terminal=false
Type=Application
Categories=Development;Education;
EOF
  printf '%s\n' "Installed: ${binary_path}" "Installed desktop entry: ${desktop_path}" 'Launch Sparring from your applications menu or run: sparring'
fi

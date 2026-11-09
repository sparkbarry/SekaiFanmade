#!/usr/bin/env bash
# Runs on ourtaiko-prod: loads an image archive built elsewhere and swaps the container.
#   publish.sh <image.tar.gz> <sha256> <revision>
set -euo pipefail
archive=$1
expected_sha=$2
revision=$3
base=/opt/sekai-fanmade

[[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || { echo 'bad sha256'; exit 1; }
actual=$(sha256sum -- "$archive")
test "${actual%% *}" = "$expected_sha" || { echo 'Image archive checksum mismatch'; exit 1; }

exec 9>"$base/publish.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }

sudo -n docker load < "$archive"
label=$(sudo -n docker image inspect "sekai-fanmade:$revision" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
test "$label" = "$revision" || { echo "Image revision mismatch: $label"; exit 1; }

previous=$(sudo -n docker image inspect sekai-fanmade:release --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)
if [ -n "$previous" ] && [ "$previous" != "$revision" ]; then
  sudo -n docker tag sekai-fanmade:release "sekai-fanmade:previous"
fi
sudo -n docker tag "sekai-fanmade:$revision" sekai-fanmade:release
sudo -n docker compose -f "$base/compose.yml" up -d --wait --no-deps web
curl -fsS http://127.0.0.1:8094/readyz
echo
echo "Published sekai-fanmade $revision (previous: ${previous:-none})"
rm -f -- "$archive"

# Keep release and previous (for a quick rollback); drop other tags.
sudo -n docker image ls sekai-fanmade --format '{{.Tag}}' | while read -r tag; do
  case "$tag" in release|previous|"$revision"|'<none>') ;; *) sudo -n docker image rm "sekai-fanmade:$tag" >/dev/null || true ;; esac
done

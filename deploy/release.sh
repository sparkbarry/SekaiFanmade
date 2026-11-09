#!/usr/bin/env bash
# Runs on the development Mac: builds the linux/amd64 image for the current commit,
# copies it to ourtaiko-prod and runs publish.sh there.
set -euo pipefail
cd "$(dirname "$0")/.."
test -z "$(git status --porcelain)" || { echo 'Commit your changes first'; exit 1; }
revision=$(git rev-parse HEAD)
host=${DEPLOY_HOST:-ourtaiko-prod}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

docker buildx build --platform linux/amd64 --build-arg "REVISION=$revision" -t "sekai-fanmade:$revision" --load .
docker save "sekai-fanmade:$revision" | gzip -6 > "$work/image.tar.gz"
sha=$(shasum -a 256 "$work/image.tar.gz" | cut -d' ' -f1)
ls -lh "$work/image.tar.gz"

ssh -o BatchMode=yes "$host" 'mkdir -p /opt/sekai-fanmade/incoming'
scp -o BatchMode=yes "$work/image.tar.gz" "$host:/opt/sekai-fanmade/incoming/$revision.tar.gz"
scp -o BatchMode=yes deploy/publish.sh "$host:/opt/sekai-fanmade/publish.sh"
scp -o BatchMode=yes deploy/compose.production.yml "$host:/opt/sekai-fanmade/compose.yml"
ssh -o BatchMode=yes "$host" "bash /opt/sekai-fanmade/publish.sh /opt/sekai-fanmade/incoming/$revision.tar.gz $sha $revision"

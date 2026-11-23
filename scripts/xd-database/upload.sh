#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || ! ${2:-} =~ ^[1-9][0-9]*$ || ! -f ${1:-}/manifest.json ]]; then
  echo "usage: $0 <out/vN> <N> (directory must contain manifest.json)" >&2
  exit 1
fi

dir=$1
bucket=chess-studio-engine
prefix="xd-database/v$2"
wrangler_max_bytes=$((300 * 1024 * 1024))
shopt -s dotglob nullglob
for file in "$dir"/*; do
  [[ -f $file ]] || continue
  name=${file##*/}
  content_type=application/octet-stream
  if [[ $name == manifest.json ]]; then
    content_type=application/json
  fi
  printf 'Uploading %s\n' "$file"
  if (( $(stat -c %s -- "$file") > wrangler_max_bytes )); then
    : "${XD_R2_ENDPOINT:?Set XD_R2_ENDPOINT and configure AWS CLI credentials for large R2 uploads}"
    aws s3 cp "$file" "s3://$bucket/$prefix/$name" --content-type "$content_type" --endpoint-url "$XD_R2_ENDPOINT"
  else
    npx wrangler r2 object put "$bucket/$prefix/$name" --file "$file" --content-type "$content_type" --remote
  fi
done

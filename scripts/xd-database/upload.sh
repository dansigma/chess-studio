#!/usr/bin/env bash
# Uploads one built version (out/v<N>) to R2 under xd-database/v<N>/ through the R2 S3 API
# (aws CLI; multipart for large files). Only the files listed in manifest.json are sent, and
# manifest.json goes last, so a version prefix with a manifest is complete. Each upload is
# checked by size.
#
# Needs: XD_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com and R2 credentials for the
# bucket in AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or an aws profile via AWS_PROFILE).
set -euo pipefail

if [[ $# -ne 2 || ! ${2:-} =~ ^[1-9][0-9]*$ || ! -f ${1:-}/manifest.json ]]; then
  echo "usage: $0 <out/vN> <N> (directory must contain manifest.json)" >&2
  exit 1
fi
: "${XD_R2_ENDPOINT:?Set XD_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com}"

dir=$1
version=$2
bucket=${XD_R2_BUCKET:-chess-studio-xd}
prefix="xd-database/v$version"
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-auto}

manifest_version=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$dir/manifest.json")
if [[ $manifest_version != "$version" ]]; then
  echo "manifest.json is version $manifest_version, not $version" >&2
  exit 1
fi
listing=$(node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).files).join("\n"))' "$dir/manifest.json")
mapfile -t names <<< "$listing"
if [[ ${#names[@]} -eq 0 || -z ${names[0]} ]]; then
  echo "manifest.json lists no files" >&2
  exit 1
fi
# Versions are immutable: never write into a prefix that already has objects.
existing=$(aws s3api list-objects-v2 --bucket "$bucket" --prefix "$prefix/" --max-keys 1 --endpoint-url "$XD_R2_ENDPOINT" --query KeyCount --output text)
if [[ $existing != 0 ]]; then
  echo "s3://$bucket/$prefix/ already has objects; pick a new version (or empty the prefix first)" >&2
  exit 1
fi

upload() {
  local name=$1 content_type=$2 file="$dir/$1"
  [[ -f $file ]] || { echo "missing $file" >&2; exit 1; }
  local bytes remote
  bytes=$(wc -c < "$file" | tr -d ' ')
  printf 'Uploading %s (%s bytes)\n' "$name" "$bytes"
  aws s3 cp "$file" "s3://$bucket/$prefix/$name" --content-type "$content_type" --endpoint-url "$XD_R2_ENDPOINT" --only-show-errors
  remote=$(aws s3api head-object --bucket "$bucket" --key "$prefix/$name" --endpoint-url "$XD_R2_ENDPOINT" --query ContentLength --output text)
  if [[ $remote != "$bytes" ]]; then
    echo "$name: uploaded $remote bytes, expected $bytes" >&2
    exit 1
  fi
}

for name in "${names[@]}"; do
  [[ $name == manifest.json ]] && continue
  upload "$name" application/octet-stream
done
upload manifest.json application/json
echo "xd-database/v$version uploaded and verified"

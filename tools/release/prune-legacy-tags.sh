#!/usr/bin/env bash
set -euo pipefail

# Tools for pruning legacy automated deployment tags while preserving semantic version tags.

DRY_RUN=true
if [[ "${1:-}" == "--execute" ]]; then
  DRY_RUN=false
fi

echo "=== Legacy Tag Pruning Scanner ==="

# Gather all tags
all_tags=$(git tag -l)

to_delete=()
to_keep=()

for tag in ${all_tags}; do
  if [[ "${tag}" =~ ^(deploy-|prod-|00[0-9]{2}$) ]]; then
    to_delete+=("${tag}")
  else
    to_keep+=("${tag}")
  fi
done

echo "Preserved canonical tags (${#to_keep[@]}):"
for tag in "${to_keep[@]}"; do
  echo "  [KEEP] ${tag}"
done

echo ""
echo "Target legacy tags to prune (${#to_delete[@]}):"
echo "  Deploy tags: $(echo "${to_delete[*]}" | tr ' ' '\n' | grep -c '^deploy-' || true)"
echo "  Prod tags:   $(echo "${to_delete[*]}" | tr ' ' '\n' | grep -c '^prod-' || true)"
echo "  Numeric tags:$(echo "${to_delete[*]}" | tr ' ' '\n' | grep -c '^00' || true)"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo ""
  echo "DRY RUN MODE: No tags were deleted."
  echo "To delete local and remote tags, run: bash tools/release/prune-legacy-tags.sh --execute"
  exit 0
fi

echo ""
echo "EXECUTING TAG DELETION..."

# Batch remote deletion in chunks of 50 to avoid shell argument overflow
chunk_size=50
for ((i=0; i<${#to_delete[@]}; i+=chunk_size)); do
  chunk=("${to_delete[@]:i:chunk_size}")
  echo "Deleting remote batch $((i/chunk_size + 1)) (${#chunk[@]} tags)..."
  git push origin --delete "${chunk[@]}" || true
  git tag -d "${chunk[@]}" || true
done

echo ""
echo "Tag pruning complete. Remaining tags:"
git tag -l

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Fail only on security-group *ingress* world-open CIDRs.
# Route table defaults and SG egress 0.0.0.0/0 are out of scope for this guard.
terraform_files=()
while IFS= read -r -d '' terraform_file; do
  [[ -f "${terraform_file}" ]] || continue
  terraform_files+=("${terraform_file}")
done < <(git ls-files -z -- '*.tf')

if (( ${#terraform_files[@]} == 0 )); then
  echo "terraform world-open SG ingress guard passed (no tracked .tf files)"
  exit 0
fi

hits="$(
  python3 - "${terraform_files[@]}" <<'PY'
from pathlib import Path
import re
import sys

ingress_block = re.compile(r"ingress\s*\{([^{}]|\{[^{}]*\})*\}", re.MULTILINE)
sg_rule = re.compile(
    r'resource\s+"aws_security_group_rule"\s+"[^"]+"\s*\{([^{}]|\{[^{}]*\})*\}',
    re.MULTILINE,
)
vpc_ingress_rule = re.compile(
    r'resource\s+"aws_vpc_security_group_ingress_rule"\s+"[^"]+"\s*\{([^{}]|\{[^{}]*\})*\}',
    re.MULTILINE,
)
findings = []

for raw_path in sys.argv[1:]:
    path = Path(raw_path)
    text = path.read_text(encoding="utf-8")
    for match in ingress_block.finditer(text):
        block = match.group(0)
        if "0.0.0.0/0" in block:
            line = text.count("\n", 0, match.start()) + 1
            findings.append(f"{path}:{line}: world-open ingress block")
    for match in sg_rule.finditer(text):
        block = match.group(0)
        if 'type' in block and re.search(r'type\s*=\s*"ingress"', block) and "0.0.0.0/0" in block:
            line = text.count("\n", 0, match.start()) + 1
            findings.append(f"{path}:{line}: world-open aws_security_group_rule ingress")
    for match in vpc_ingress_rule.finditer(text):
        block = match.group(0)
        if "0.0.0.0/0" in block:
            line = text.count("\n", 0, match.start()) + 1
            findings.append(f"{path}:{line}: world-open aws_vpc_security_group_ingress_rule")

print("\n".join(findings), end="")
PY
)"

if [[ -n "${hits}" ]]; then
  echo "FAIL: world-open CIDR 0.0.0.0/0 found on security-group ingress in tracked Terraform:" >&2
  echo "${hits}" >&2
  exit 1
fi

echo "terraform world-open SG ingress guard passed (all tracked .tf clean)"

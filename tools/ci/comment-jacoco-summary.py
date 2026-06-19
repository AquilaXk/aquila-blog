#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
import xml.etree.ElementTree as ET


MARKER = "<!-- aquila-blog:jacoco-coverage-summary -->"
SOURCE_PREFIX = "back/src/main/kotlin/"
MAX_CHANGED_FILES = 30
MAX_WORST_FILES = 20


def coverage_bar(ratio):
    filled = min(10, int(ratio // 10))
    return "█" * filled + "░" * (10 - filled)


def read_counter(node, name):
    counter = next((item for item in node.findall("counter") if item.get("type") == name), None)
    if counter is None:
        return 0, 0, 100.0
    missed = int(counter.get("missed"))
    covered = int(counter.get("covered"))
    total = missed + covered
    ratio = 100.0 if total == 0 else covered * 100.0 / total
    return missed, covered, ratio


def count_baseline_exclusions(path):
    if path is None or not path.exists():
        return 0
    return sum(
        1
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    )


def baseline_class_ratio(baseline_count, report_root):
    class_missed, class_covered, _ = read_counter(report_root, "CLASS")
    class_total = class_missed + class_covered
    if class_total == 0:
        return 0.0
    return baseline_count * 100.0 / class_total


def format_counter(name, missed, covered, ratio):
    return f"| {name} | {covered} | {missed + covered} | {missed} | {ratio:.2f}% | `{coverage_bar(ratio)}` |"


def display_path(path):
    return path.removeprefix(SOURCE_PREFIX)


def read_changed_files(path):
    if path is None or not path.exists():
        return []
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip().startswith(SOURCE_PREFIX) and line.strip().endswith(".kt")
    ]


def source_file_rows(root):
    rows = []
    for item in root.findall("package"):
        package_name = item.get("name")
        for source in item.findall("sourcefile"):
            line_missed, line_covered, line_ratio = read_counter(source, "LINE")
            branch_missed, branch_covered, branch_ratio = read_counter(source, "BRANCH")
            path = f"{SOURCE_PREFIX}{package_name}/{source.get('name')}"
            rows.append(
                {
                    "path": path,
                    "line_missed": line_missed,
                    "line_covered": line_covered,
                    "line_ratio": line_ratio,
                    "branch_missed": branch_missed,
                    "branch_covered": branch_covered,
                    "branch_ratio": branch_ratio,
                },
            )
    return rows


def format_file_row(row):
    return (
        f"| `{display_path(row['path'])}` | {row['line_ratio']:.2f}% | {row['line_missed']} | "
        f"{row['branch_ratio']:.2f}% | {row['branch_missed']} | `{coverage_bar(row['line_ratio'])}` |"
    )


def append_file_section(lines, title, rows, empty_message):
    lines.extend(["", f"## {title}", ""])
    if not rows:
        lines.append(empty_message)
        return
    lines.extend(
        [
            "| 파일 | Line | 미커버 Line | Branch | 미커버 Branch | 그래프 |",
            "| --- | ---: | ---: | ---: | ---: | --- |",
        ],
    )
    lines.extend(format_file_row(row) for row in rows)


def build_summary(report_path, baseline_path, changed_files_path=None, full_report_path=None):
    root = ET.parse(report_path).getroot()
    line_missed, line_covered, line_ratio = read_counter(root, "LINE")
    status = "통과" if line_missed == 0 and line_ratio >= 100.0 else "미달"
    baseline_count = count_baseline_exclusions(baseline_path)
    full_root = ET.parse(full_report_path).getroot() if full_report_path is not None and full_report_path.exists() else None
    sha = os.environ.get("GITHUB_SHA", "")
    sha_line = f"- Commit: `{sha}`" if sha else ""
    rows = source_file_rows(root)
    row_by_path = {item["path"]: item for item in rows}
    changed_files = read_changed_files(changed_files_path)
    changed_rows = [row_by_path[path] for path in changed_files if path in row_by_path]
    worst_rows = sorted(
        (item for item in rows if item["line_missed"] > 0),
        key=lambda item: (item["line_missed"], item["branch_missed"], item["path"]),
        reverse=True,
    )[:MAX_WORST_FILES]

    counters = [
        ("Instruction", *read_counter(root, "INSTRUCTION")),
        ("Line", *read_counter(root, "LINE")),
        ("Branch", *read_counter(root, "BRANCH")),
        ("Method", *read_counter(root, "METHOD")),
        ("Class", *read_counter(root, "CLASS")),
    ]
    full_line_ratio = read_counter(full_root, "LINE")[2] if full_root is not None else None
    full_branch_ratio = read_counter(full_root, "BRANCH")[2] if full_root is not None else None
    excluded_class_ratio = baseline_class_ratio(baseline_count, full_root) if full_root is not None else None

    lines = [
        MARKER,
        "## Jacoco 테스트 커버리지 요약",
        "",
        f"- 상태: **{status}**",
        f"- Baseline 제외 후 Line coverage: **{line_ratio:.2f}%**",
        "- Gate 기준: static/baseline 제외 후 신규 코드 line coverage 100%",
        f"- Baseline 제외 클래스: `{baseline_count}`개",
    ]
    if full_root is not None:
        lines.extend(
            [
                f"- Full report Line coverage: **{full_line_ratio:.2f}%**",
                f"- Full report Branch coverage: **{full_branch_ratio:.2f}%**",
                f"- Baseline 제외 class ratio: **{excluded_class_ratio:.2f}%**",
            ],
        )
    if sha_line:
        lines.append(sha_line)
    lines.extend(
        [
            "",
            "| 유형 | 커버 | 전체 | 미커버 | 비율 | 그래프 |",
            "| --- | ---: | ---: | ---: | ---: | --- |",
        ],
    )
    lines.extend(format_counter(*item) for item in counters)
    append_file_section(
        lines,
        "변경 파일 커버리지",
        changed_rows[:MAX_CHANGED_FILES],
        "- 변경된 production Kotlin 파일이 없거나 baseline 제외 대상입니다",
    )
    append_file_section(
        lines,
        "Top 미커버 파일",
        worst_rows,
        "- 미커버 source file 없음",
    )
    lines.extend(
        [
            "",
            "## 상세 report",
            "",
            "- Actions artifact: `jacoco-pr-report`",
            f"- Baseline-filtered XML path: `{report_path}`",
            f"- Baseline: `{baseline_path}`",
        ],
    )
    if full_report_path is not None:
        lines.append(f"- Full XML path: `{full_report_path}`")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Create a Jacoco coverage summary PR comment body.")
    parser.add_argument("report", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--changed-files", type=Path)
    parser.add_argument("--full-report", type=Path)
    args = parser.parse_args()

    if not args.report.exists():
        raise SystemExit(f"Jacoco report not found: {args.report}")
    if args.full_report is not None and not args.full_report.exists():
        raise SystemExit(f"Full Jacoco report not found: {args.full_report}")

    print(build_summary(args.report, args.baseline, args.changed_files, args.full_report))


if __name__ == "__main__":
    main()

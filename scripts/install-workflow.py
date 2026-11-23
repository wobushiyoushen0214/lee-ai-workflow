#!/usr/bin/env python3
"""将本包工作流接入已有项目；默认只预览，--apply 才写文件。"""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
START = "<!-- momofish-workflow:start -->"
END = "<!-- momofish-workflow:end -->"


def files():
    fixed = ["docs/ai-workflow.md", "docs/workflow.md", "workflow.config.json",
             "scripts/check-workflow.py", "scripts/test_check_workflow.py",
             "scripts/test_portable_workflow.py", "scripts/install-workflow.py"]
    for name in fixed:
        yield ROOT / name
    for directory in ["templates", ".agents/skills/write-notes-like-deepseek", "reference"]:
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.name != ".DS_Store":
                yield path


def plan(target):
    """整批检查，发现冲突时任何内容均不写；不允许写出目标根目录。"""
    target = Path(target).expanduser().resolve()
    if not target.is_dir():
        raise ValueError("目标项目必须是已存在的目录")
    if target == ROOT:
        raise ValueError("目标不能是试用包本身")
    changes, conflicts = [], []

    def destination(relative):
        path = target / relative
        try:
            path.resolve().relative_to(target)
        except ValueError:
            conflicts.append(relative + "：符号链接越出目标项目")
            return None
        if path.is_symlink():
            conflicts.append(relative + "：目标为符号链接")
            return None
        for parent in path.parents:
            if parent == target:
                break
            if parent.exists() and not parent.is_dir():
                conflicts.append(relative + "：父路径不是目录")
                return None
        return path

    for source in files():
        relative = source.relative_to(ROOT).as_posix()
        path = destination(relative)
        if path is None:
            continue
        content = source.read_bytes()
        if path.exists():
            if not path.is_file() or path.read_bytes() != content:
                conflicts.append(relative + "：已存在不同内容")
        else:
            changes.append((path, content))

    path = destination("AGENTS.md")
    if path is not None:
        entry = (ROOT / "templates/AGENTS-entry.txt").read_text(encoding="utf-8").strip()
        if path.exists():
            if not path.is_file():
                conflicts.append("AGENTS.md：不是文件")
            else:
                original = path.read_text(encoding="utf-8")
                if START in original or END in original:
                    if original.count(START) != 1 or original.count(END) != 1:
                        conflicts.append("AGENTS.md：入口标记重复或不完整")
                    else:
                        start, end = original.index(START), original.index(END) + len(END)
                        if original[start:end] != entry:
                            conflicts.append("AGENTS.md：已有入口块与本包不同，请手工合并")
                else:
                    changes.append((path, (original + "\n\n" + entry + "\n").encode("utf-8")))
        else:
            changes.append((path, ("# 项目协作约定\n\n" + entry + "\n").encode("utf-8")))

    for directory in [".agents/notes", "docs/ux-evidence", "docs/releases"]:
        path = destination(directory)
        if path is None:
            continue
        if path.exists() and not path.is_dir():
            conflicts.append(directory + "：不是目录")
        elif not path.exists():
            changes.append((path / ".gitkeep", b""))
    if conflicts:
        raise ValueError("接入前发现冲突，未写入任何文件：\n" + "\n".join(conflicts))
    return target, changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="已有项目目录")
    parser.add_argument("--apply", action="store_true", help="实际写入；默认只预览")
    args = parser.parse_args()
    try:
        target, changes = plan(args.target)
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print("实际接入：" if args.apply else "预览接入：", target)
    for path, content in changes:
        print(("追加入口：" if path.name == "AGENTS.md" and path.exists() else "新增：") + path.relative_to(target).as_posix())
        if args.apply:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print(f"{'已写入' if args.apply else '待写入'} {len(changes)} 项；接入后填写 docs/workflow.md 的项目命令和规则。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

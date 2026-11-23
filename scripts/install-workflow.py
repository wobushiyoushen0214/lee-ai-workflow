#!/usr/bin/env python3
"""接入或升级 lee-ai-workflow；默认预览，--apply 才写目标项目。"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
START = "<!-- momofish-workflow:start -->"
END = "<!-- momofish-workflow:end -->"
STATE = ".agents/workflow/installation.json"
PACKAGE = "workflow-package.json"
PROJECT_FILES = {"docs/workflow.md", "workflow.config.json"}
FIXED_FILES = [
    "docs/ai-workflow.md", "docs/distribution.md", "docs/workflow.md", "workflow.config.json", PACKAGE,
    "scripts/check-workflow.py", "scripts/test_check_workflow.py",
    "scripts/test_portable_workflow.py", "scripts/test_update_workflow.py",
    "scripts/install-workflow.py", "scripts/lee-workflow.py",
]
DIRECTORIES = ["templates", ".agents/skills/write-notes-like-deepseek", "reference"]
HASH = re.compile(r"^[0-9a-f]{64}$")


def files(source=None):
    source = Path(source or ROOT).resolve()
    for name in FIXED_FILES:
        yield source / name
    for directory in DIRECTORIES:
        for path in sorted((source / directory).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.name != ".DS_Store":
                yield path


def digest(content):
    return hashlib.sha256(content).hexdigest()


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def repository_url(value):
    if not isinstance(value, str):
        raise ValueError("仓库必须是 GitHub owner/repo 或 HTTPS 地址")
    match = re.fullmatch(r"(?:https://github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?", value)
    if not match or any(part in {".", ".."} for part in match.groups()):
        raise ValueError("仓库必须是 GitHub owner/repo 或 HTTPS 地址")
    return "https://github.com/" + "/".join(match.groups())


def reference(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", value) or ".." in value:
        raise ValueError("ref 必须是有效的分支、标签或提交号")
    return value


def managed_path(relative):
    if not isinstance(relative, str):
        return False
    path = Path(relative)
    return (
        not path.is_absolute()
        and ".." not in path.parts
        and not any(part in {".git", "__pycache__"} for part in path.parts)
        and (relative in FIXED_FILES or any(relative.startswith(p + "/") for p in DIRECTORIES))
    )


def destination(target, relative):
    path = target / relative
    try:
        path.resolve().relative_to(target)
    except ValueError:
        raise ValueError(relative + "：符号链接越出目标项目")
    for candidate in [path, *path.parents]:
        if candidate == target:
            break
        if candidate.is_symlink():
            raise ValueError(relative + "：目标或父路径为符号链接")
        if candidate != path and candidate.exists() and not candidate.is_dir():
            raise ValueError(relative + "：父路径不是目录")
    return path


def existing(path):
    if path.exists():
        if not path.is_file():
            raise ValueError(str(path) + "：不是文件")
        return path.read_bytes()
    return None


def entry_span(content):
    start_marker, end_marker = START.encode(), END.encode()
    if start_marker not in content and end_marker not in content:
        return None
    if content.count(start_marker) != 1 or content.count(end_marker) != 1:
        raise ValueError("AGENTS.md：入口标记重复或不完整")
    start = content.index(start_marker)
    end = content.index(end_marker) + len(end_marker)
    if start >= end - len(end_marker):
        raise ValueError("AGENTS.md：入口标记顺序错误")
    return start, end


def source_revision(source):
    if not (source / ".git").exists():
        return None
    try:
        status = subprocess.run(["git", "-C", str(source), "status", "--porcelain"],
                                capture_output=True, text=True, timeout=10, check=True)
        if status.stdout:
            return None
        result = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"],
                                capture_output=True, text=True, timeout=10, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def snapshot(source):
    source = Path(source).expanduser().resolve()
    package = json.loads((source / PACKAGE).read_text(encoding="utf-8"))
    if not isinstance(package, dict) or package.get("name") != "lee-ai-workflow" or not isinstance(package.get("version"), str):
        raise ValueError("不是有效的 lee-ai-workflow 源目录")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", package["version"]):
        raise ValueError("工作流版本格式无效")
    repository = repository_url(package.get("repository"))
    branch = reference(package.get("branch"))
    contents = {}
    for path in files(source):
        relative = path.relative_to(source).as_posix()
        if not managed_path(relative):
            raise ValueError("不支持的分发路径：" + relative)
        contents[relative] = destination(source, relative).read_bytes()
    entry = contents["templates/AGENTS-entry.txt"].strip()
    if entry_span(entry) != (0, len(entry)):
        raise ValueError("源目录的 AGENTS 入口块不完整")
    state = {
        "schema_version": 1, "name": "lee-ai-workflow",
        "version": package["version"], "repository": repository, "branch": branch,
        "revision": source_revision(source),
        "files": {p: digest(content) for p, content in contents.items()},
        "entry_sha256": digest(entry),
    }
    return contents, entry, state


def installed(target):
    target = Path(target).expanduser().resolve()
    content = existing(destination(target, STATE))
    if content is None:
        raise ValueError("没有安装记录；旧版先核对合并，再用 install --adopt 登记。")
    state = json.loads(content)
    if not isinstance(state, dict) or set(state) != {
        "schema_version", "name", "version", "repository", "branch", "revision", "files", "entry_sha256"
    }:
        raise ValueError("安装记录结构无效")
    if type(state["schema_version"]) is not int or state["schema_version"] != 1 or state["name"] != "lee-ai-workflow":
        raise ValueError("安装记录版本或名称无效")
    if not isinstance(state["version"], str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", state["version"]):
        raise ValueError("安装记录的工作流版本无效")
    repository_url(state["repository"])
    reference(state["branch"])
    if state["revision"] is not None and (
        not isinstance(state["revision"], str) or not re.fullmatch(r"[0-9a-f]{40,64}", state["revision"])
    ):
        raise ValueError("安装记录的提交号无效")
    if not isinstance(state["files"], dict) or not state["files"]:
        raise ValueError("安装记录缺少文件摘要")
    for relative, expected in state["files"].items():
        if not isinstance(relative, str) or not managed_path(relative) or not isinstance(expected, str) or not HASH.fullmatch(expected):
            raise ValueError("安装记录包含无效路径或摘要")
    if not isinstance(state["entry_sha256"], str) or not HASH.fullmatch(state["entry_sha256"]):
        raise ValueError("安装记录的入口摘要无效")
    return state


class Changes(list):
    def __init__(self, target):
        super().__init__()
        self.target = target
        self.before = {}
        self.preserved = []

    def read(self, relative):
        path = destination(self.target, relative)
        content = existing(path)
        self.before[path] = content
        return path, content

    def write(self, path, content):
        if self.before[path] != content:
            self.append((path, content))


def plan(target, source=None, adopt=False):
    """整批检查，发现冲突时任何内容均不写；不允许写出目标根目录。"""
    target = Path(target).expanduser().resolve()
    if not target.is_dir():
        raise ValueError("目标项目必须是已存在的目录")
    source = Path(source or ROOT).expanduser().resolve()
    if target == source:
        raise ValueError("目标不能是试用包本身")
    contents, entry, state = snapshot(source)
    changes, conflicts = Changes(target), []
    for relative, content in contents.items():
        try:
            path, original = changes.read(relative)
            if original is not None and original != content:
                if adopt and relative in PROJECT_FILES:
                    changes.preserved.append(relative)
                else:
                    conflicts.append(relative + "：已存在不同内容")
            else:
                changes.write(path, content)
        except ValueError as exc:
            conflicts.append(str(exc))

    try:
        path, original = changes.read("AGENTS.md")
        if original is None:
            changes.write(path, "# 项目协作约定\n\n".encode("utf-8") + entry + b"\n")
        else:
            span = entry_span(original)
            if span:
                start, end = span
                if original[start:end] != entry:
                    conflicts.append("AGENTS.md：已有入口块与本包不同，请手工合并")
            else:
                changes.write(path, original + b"\n\n" + entry + b"\n")
    except ValueError as exc:
        conflicts.append(str(exc))

    for directory in [".agents/notes", "docs/ux-evidence", "docs/releases"]:
        try:
            path = destination(target, directory)
            if path.exists() and not path.is_dir():
                conflicts.append(directory + "：不是目录")
            elif not path.exists():
                keep, _ = changes.read(directory + "/.gitkeep")
                changes.write(keep, b"")
        except ValueError as exc:
            conflicts.append(str(exc))
    try:
        path, original = changes.read(STATE)
        if original is not None and installed(target) != state:
            conflicts.append(STATE + "：已经接入不同版本，请使用 update")
        else:
            changes.write(path, json_bytes(state))
    except ValueError as exc:
        conflicts.append(str(exc))
    if conflicts:
        raise ValueError("接入前发现冲突，未写入任何文件：\n" + "\n".join(conflicts))
    return target, changes


def plan_update(target, source):
    target = Path(target).expanduser().resolve()
    source = Path(source).expanduser().resolve()
    if not target.is_dir() or target == source:
        raise ValueError("升级目标必须是已有项目，且不能是源目录本身")
    previous = installed(target)
    contents, entry, state = snapshot(source)
    changes, conflicts = Changes(target), []
    for relative in sorted(set(previous["files"]) | set(contents)):
        try:
            path, original = changes.read(relative)
            desired = contents.get(relative)
            baseline = previous["files"].get(relative)
            if relative in PROJECT_FILES and baseline is not None:
                changes.preserved.append(relative)
                continue
            if desired == original:
                continue
            actual = digest(original) if original is not None else None
            wanted = digest(desired) if desired is not None else None
            if baseline is None:
                if original is not None:
                    conflicts.append(relative + "：新增分发文件与项目现有文件冲突")
                elif desired is not None:
                    changes.write(path, desired)
            elif actual == baseline:
                changes.write(path, desired)
            elif wanted == baseline:
                changes.preserved.append(relative + "（本地修改，上游未变）")
            else:
                conflicts.append(relative + "：本地与上游同时改动，请先合并")
        except ValueError as exc:
            conflicts.append(str(exc))
    try:
        path, original = changes.read("AGENTS.md")
        span = entry_span(original or b"")
        if not span:
            conflicts.append("AGENTS.md：受管理入口已被移除")
        else:
            start, end = span
            actual = original[start:end]
            if actual != entry:
                if digest(actual) == previous["entry_sha256"]:
                    changes.write(path, original[:start] + entry + original[end:])
                elif digest(entry) == previous["entry_sha256"]:
                    changes.preserved.append("AGENTS.md 工作流块（本地修改，上游未变）")
                else:
                    conflicts.append("AGENTS.md：工作流块与上游同时改动，请先合并")
    except ValueError as exc:
        conflicts.append(str(exc))
    path, _ = changes.read(STATE)
    changes.write(path, json_bytes(state))
    if conflicts:
        raise ValueError("升级前发现冲突，未写入任何文件：\n" + "\n".join(conflicts))
    return target, changes


def atomic_write(path, content):
    mode = path.stat().st_mode & 0o777 if path.exists() else None
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".lee-workflow-", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        if mode is not None:
            temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def apply(changes):
    """写入前再查基线；单文件原子替换，I/O 失败还原本批已写内容。"""
    for path, expected in changes.before.items():
        checked = destination(changes.target, path.relative_to(changes.target).as_posix())
        if existing(checked) != expected:
            raise ValueError(str(path) + "：预览后文件发生变化，未写入任何文件")
    applied, created = [], []
    try:
        for path, content in changes:
            parents = []
            parent = path.parent
            while not parent.exists():
                parents.append(parent)
                parent = parent.parent
            path.parent.mkdir(parents=True, exist_ok=True)
            created.extend(reversed(parents))
            if content is None:
                path.unlink()
            else:
                atomic_write(path, content)
            applied.append((path, content))
    except OSError as exc:
        failures = []
        for path, desired in reversed(applied):
            try:
                if existing(path) != desired:
                    failures.append(str(path) + "：另有并发改动，未覆盖")
                    continue
                original = changes.before[path]
                if original is None:
                    path.unlink()
                else:
                    atomic_write(path, original)
            except OSError as error:
                failures.append(str(error))
        for directory in reversed(created):
            try:
                directory.rmdir()
            except OSError:
                pass
        message = "写入失败，已还原本批已写文件：" + str(exc)
        if failures:
            message += "\n需要核对：" + "\n".join(failures)
        raise ValueError(message) from exc


@contextmanager
def checkout(repository, ref):
    """获取指定 GitHub 分支/标签/提交；目标项目此时还没有写入。"""
    repository = repository_url(repository)
    ref = reference(ref)
    with tempfile.TemporaryDirectory(prefix="lee-workflow-upstream-") as directory:
        source = Path(directory)
        commands = [
            ["git", "init", "--quiet", str(source)],
            ["git", "-C", str(source), "remote", "add", "origin", repository],
            ["git", "-C", str(source), "fetch", "--quiet", "--depth", "1", "origin", ref],
            ["git", "-C", str(source), "checkout", "--quiet", "--detach", "FETCH_HEAD"],
        ]
        for command in commands:
            result = subprocess.run(command, capture_output=True, text=True, timeout=120,
                                    env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
            if result.returncode:
                raise ValueError("获取上游失败，目标项目未修改：\n" + result.stderr.strip())
        yield source


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    action = argv.pop(0) if argv and argv[0] in {"install", "update"} else "install"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, nargs="?" if action == "update" else None,
                        default=Path.cwd() if action == "update" else None, help="已有项目目录")
    parser.add_argument("--apply", action="store_true", help="实际写入；默认只预览")
    parser.add_argument("--source", type=Path, help="使用已下载的源目录，不联网")
    parser.add_argument("--repo", help="升级来源 GitHub owner/repo 或 HTTPS 地址")
    parser.add_argument("--ref", help="升级到指定分支、标签或提交；默认上游主分支")
    parser.add_argument("--adopt", action="store_true", help="已核对的旧接入登记：保留项目适配，其余分发文件须相同")
    args = parser.parse_args(argv)
    if action != "update" and (args.repo or args.ref):
        parser.error("--repo/--ref 仅适用于 update；首次安装先克隆或指定 --source")
    if action == "update" and args.adopt:
        parser.error("--adopt 仅适用于 install")
    if args.source and (args.repo or args.ref):
        parser.error("--source 与 --repo/--ref 不能同时使用")

    def execute(source):
        target, changes = plan_update(args.target, source) if action == "update" else plan(args.target, source, args.adopt)
        print(("实际" if args.apply else "预览") + ("升级：" if action == "update" else "接入："), target)
        for path, content in changes:
            operation = "移除：" if content is None else "更新：" if path.exists() else "新增："
            print(operation + path.relative_to(target).as_posix())
        if changes.preserved:
            print("保留项目内容：" + "、".join(changes.preserved))
        if args.apply:
            apply(changes)
        print(f"{'已处理' if args.apply else '待处理'} {len(changes)} 项。")
        return 0

    try:
        if action == "update" and not args.source:
            state = installed(args.target.expanduser().resolve())
            with checkout(args.repo or state["repository"], args.ref or state["branch"]) as source:
                return execute(source)
        return execute(args.source or ROOT)
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

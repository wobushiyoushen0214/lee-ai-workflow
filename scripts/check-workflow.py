#!/usr/bin/env python3
"""工作流自检：检查方案记录、证据目录、发布记录、提交信息与文档链接。

用法：
    python3 scripts/check-workflow.py --commits 0 # 全量结构检查，不读 Git
    python3 scripts/check-workflow.py --strict    # WARN 也返回非零
    python3 scripts/check-workflow.py --commits 30

退出码：0 = 通过（可能有 WARN）；1 = 存在 FAIL（或 strict 下 WARN）；2 = 参数/配置错误。
只读检查，不修改任何文件，不跑构建/测试。
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
from urllib.parse import unquote

ROOT = pathlib.Path(__file__).resolve().parents[1]
NOTES_DIR = ROOT / ".agents" / "notes"
EVIDENCE_DIR = ROOT / "docs" / "ux-evidence"
RELEASES_DIR = ROOT / "docs" / "releases"
LINK_DOCS = [ROOT / "docs" / "ai-workflow.md", ROOT / "docs" / "workflow.md", ROOT / "AGENTS.md"]

ALLOW_NO_RELEASES = True
RELEASE_REQUIRED = {"md", "build", "package", "online"}
RELEASE_OPTIONAL = set()
DEFAULT_CONFIG = {'version': 1, 'notes_dir': '.agents/notes', 'evidence_dir': 'docs/ux-evidence', 'releases_dir': 'docs/releases', 'allow_no_releases': True, 'release_required': ['md', 'build', 'package', 'online'], 'release_optional': [], 'link_docs': ['AGENTS.md', 'docs/ai-workflow.md', 'docs/workflow.md'], 'link_globs': ['templates/**/*.md', '.agents/skills/**/*.md', 'docs/**/*.md']}


def configure(root, config_path=None):
    """只接受项目内的相对路径；不依赖调用进程所在目录。"""
    global ROOT, NOTES_DIR, EVIDENCE_DIR, RELEASES_DIR, LINK_DOCS
    global ALLOW_NO_RELEASES, RELEASE_REQUIRED, RELEASE_OPTIONAL
    ROOT = pathlib.Path(root).expanduser().resolve()
    if not ROOT.is_dir():
        raise ValueError("目标项目目录不存在")
    config_file = pathlib.Path(config_path).expanduser() if config_path else ROOT / "workflow.config.json"
    if not config_file.is_absolute():
        config_file = ROOT / config_file
    data = dict(DEFAULT_CONFIG)
    if config_file.is_file():
        loaded = json.loads(config_file.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict) or set(loaded) - set(DEFAULT_CONFIG):
            raise ValueError("配置必须是对象，且只能使用文档中的字段")
        data.update(loaded)
    elif config_path:
        raise ValueError("指定的配置文件不存在")
    if type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("仅支持配置 version=1")
    if type(data["allow_no_releases"]) is not bool:
        raise ValueError("allow_no_releases 必须是布尔值")

    def local_path(value):
        if not isinstance(value, str) or not value or pathlib.Path(value).is_absolute():
            raise ValueError("配置路径必须为非空项目内相对路径")
        path = (ROOT / value).resolve()
        try:
            path.relative_to(ROOT)
        except ValueError:
            raise ValueError("配置路径不能越出项目目录")
        return path

    NOTES_DIR = local_path(data["notes_dir"])
    EVIDENCE_DIR = local_path(data["evidence_dir"])
    RELEASES_DIR = local_path(data["releases_dir"])
    for key in ("link_docs", "link_globs", "release_required", "release_optional"):
        if not isinstance(data[key], list) or any(not isinstance(item, str) or not item for item in data[key]):
            raise ValueError(key + " 必须为非空字符串列表")
    LINK_DOCS = [local_path(item) for item in data["link_docs"]]
    for pattern in data["link_globs"]:
        if pathlib.Path(pattern).is_absolute() or ".." in pathlib.Path(pattern).parts:
            raise ValueError("link_globs 必须在项目内")
        LINK_DOCS.extend(local_path(path.relative_to(ROOT).as_posix()) for path in ROOT.glob(pattern) if path.is_file())
    for suffix in data["release_required"] + data["release_optional"]:
        if not re.fullmatch(r"[a-z0-9-]+", suffix):
            raise ValueError("发布记录后缀必须为小写字母、数字或连字符")
    if "md" not in data["release_required"]:
        raise ValueError("release_required 必须包含 md 发布正文")
    ALLOW_NO_RELEASES = data["allow_no_releases"]
    RELEASE_REQUIRED = set(data["release_required"])
    RELEASE_OPTIONAL = set(data["release_optional"])


results = []  # (level, path, message)


def add(level, path, message):
    results.append((level, str(path.relative_to(ROOT)) if str(path).startswith(str(ROOT)) else str(path), message))


def read(path):
    return path.read_text(encoding="utf-8", errors="ignore")


def sections(text):
    return [m.group(1).strip() for m in re.finditer(r"^##\s+(.+?)\s*$", text, re.M)]


def check_notes():
    if not NOTES_DIR.is_dir():
        add("WARN", NOTES_DIR, "没有方案记录目录（项目可能未采用 Agent Note 约定）")
        return
    name_re = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$")
    for path in sorted(NOTES_DIR.rglob("*.md")):
        if path.name in {"AGENTS.md", "CLAUDE.md"}:
            continue
        rel = path.relative_to(NOTES_DIR)
        if len(rel.parts) != 3:
            add("FAIL", path, "Note 必须位于 lifecycle/class/file.md，不能建集中 INDEX.md")
            continue
        if rel.parts[1] not in {"feature", "bug-fix", "simplification", "architecture", "process", "testing"}:
            add("FAIL", path, "未知 Note 分类：" + rel.parts[1])
        rel = path.relative_to(NOTES_DIR)
        lifecycle = rel.parts[0]
        if not name_re.match(path.name):
            add("FAIL", path, "文件名不是 YYYY-MM-DD-<kebab-topic>.md")
        text = read(path)
        secs = sections(prose_without_code(text))
        lines = text.splitlines()
        if len(lines) < 3 or not re.fullmatch(r"# Agent Note: .+", lines[0]) or lines[1] != "" or not lines[2].startswith("Status: "):
            add("FAIL", path, "头三行必须是 # Agent Note: 标题、空行、Status 状态")
        if len(re.findall(r"^Status:", prose_without_code(text), re.M)) != 1:
            add("FAIL", path, "Status 状态行必须唯一")
        if not secs or secs[0] != "Problem":
            add("FAIL", path, "首节必须为 ## Problem")
        if rel.parts[0] in {"implemented", "archived"} and any(re.match(r"^(Proposal|Plan|Migration plan|Acceptance criteria)\b", s, re.I) for s in secs):
            add("FAIL", path, "implemented/archived 禁止提案口吻小节")
        if not re.search(r"^#\s+", text, re.M):
            add("FAIL", path, "缺少一级标题 # <类型>: <主题>")
        expected_status = {
            "proposed": "proposed", "implemented": "implemented",
            "archived": "implemented", "rejected": "rejected",
        }
        if lifecycle not in expected_status:
            add("FAIL", path, f"未知生命周期目录：{lifecycle}/")
        m = re.search(r"^Status:[ \t]*(proposed|implemented|rejected)(?:[ \t]+—[ \t]+(.+?))?[ \t]*$", text, re.M)
        if not m:
            add("FAIL", path, "缺少合法 Status: proposed|implemented|rejected 状态行（archived 保留 implemented）")
        else:
            status = m.group(1)
            expect = expected_status.get(lifecycle)
            if expect and status != expect:
                add("FAIL", path, f"状态 {status} 与目录 {lifecycle}/ 不符")
            if status == "rejected" and not (m.group(2) or "").strip():
                add("FAIL", path, "rejected 状态缺少否决原因（Status: rejected — 原因）")
            if status != "rejected" and m.group(2):
                add("FAIL", path, "只有 rejected 状态允许追加否决原因")
            if lifecycle == "archived" and not re.search(r"^Archived:\s*\d{4}-\d{2}-\d{2}\s*$", text, re.M):
                add("FAIL", path, "archived 记录缺少 Archived: YYYY-MM-DD")
        has = lambda *names: any(s in secs for s in names)
        if not has("Problem", "问题"):
            add("FAIL", path, "缺少 ## Problem")
        if not has("Alternatives considered", "备选方案"):
            add("FAIL", path, "缺少 ## Alternatives considered")
        if lifecycle in {"proposed", "rejected"}:
            if not has("Proposal", "Decision", "Proposal / Decision"):
                add("FAIL", path, f"{lifecycle} 记录缺少 ## Proposal")
            if not has("Acceptance criteria", "验收标准"):
                add("FAIL", path, f"{lifecycle} 记录缺少 ## Acceptance criteria")
            if not has("Risks", "风险"):
                add("WARN", path, f"{lifecycle} 记录缺少 ## Risks")
        else:
            if not has("Decision"):
                add("FAIL", path, "implemented/archived 记录缺少 ## Decision")
            valid = ("Validation", "Verification", "验证", "验证与证据", "验收与验证", "验证与失败记录", "执行记录")
            if not has(*valid):
                add("WARN", path, "缺少验证类小节（Validation/验证）")
            if not has("Consequences", "后果", "代价"):
                add("WARN", path, "缺少 ## Consequences")


def check_evidence():
    if not EVIDENCE_DIR.is_dir():
        add("WARN", EVIDENCE_DIR, "没有证据目录")
        return
    date_re = re.compile(r"^\d{4}-\d{2}-\d{2}-.+")
    for path in sorted(p for p in EVIDENCE_DIR.iterdir() if p.is_dir()):
        if not date_re.match(path.name):
            add("WARN", path, "证据目录不是 YYYY-MM-DD-<主题> 命名")
        if not (path / "README.md").is_file():
            add("WARN", path, "证据目录缺少 README.md（默认精简记录：环境/核对结果/输出链接/未验证）")


def parse_version(name):
    parts = name.split(".")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return tuple(int(p) for p in parts)
    return None


def check_releases():
    if not RELEASES_DIR.is_dir():
        add("WARN", RELEASES_DIR, "没有发布记录目录")
        return
    versions = {}
    for path in RELEASES_DIR.iterdir():
        m = re.match(r"^(\d+\.\d+\.\d+)(?:-(.+))?\.(md|json|txt)$", path.name)
        if not m:
            continue
        ver = parse_version(m.group(1))
        suffix = m.group(2) or m.group(3)
        versions.setdefault(ver, set()).add(suffix)
    if not versions:
        if not ALLOW_NO_RELEASES:
            add("WARN", RELEASES_DIR, "没有可识别的版本记录（<版本>.md 等）")
        return
    latest = max(versions)
    required = RELEASE_REQUIRED
    optional = RELEASE_OPTIONAL
    for ver in sorted(versions, reverse=True):
        have = versions[ver]
        label = ".".join(map(str, ver))
        if not required <= have:
            add("FAIL" if ver == latest else "WARN", RELEASES_DIR,
                f"{label} 缺少核心记录文件：{sorted(required - have)}")
        if ver == latest:
            miss = sorted(optional - have)
            if miss:
                add("WARN", RELEASES_DIR, f"{label}（最新）缺少可选记录文件：{miss}")


def check_commits(n):
    if n == 0:
        return
    if not (ROOT / ".git").exists():
        add("WARN", ROOT, "目标没有自己的 Git 历史；无需检查时使用 --commits 0")
        return
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "log", f"-{n}", "--pretty=format:%s"],
                             capture_output=True, text=True, timeout=15)
    except Exception as exc:  # noqa: BLE001
        add("WARN", ROOT, f"无法读取 git 历史：{exc}")
        return
    if out.returncode != 0:
        add("WARN", ROOT, "git log 失败，跳过提交信息检查")
        return
    pattern = re.compile(r"^(feat|fix|perf|refactor|style|docs|test|build|chore)(\([^)]+\))?!?: .+")
    for subject in [s for s in out.stdout.splitlines() if s.strip()]:
        if not pattern.match(subject):
            add("WARN", ROOT, f"提交信息不符合 Conventional Commits：{subject}")
        elif len(subject) > 72:
            add("WARN", ROOT, f"提交标题超过 72 字符：{subject[:40]}…")


def prose_without_code(text):
    """不把围栏或行内代码中的链接模板当作实际引用。"""
    lines = []
    fence = None
    for line in text.splitlines(keepends=True):
        match = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence) and not match.group(2).strip():
                fence = None
            lines.append("\n")
        elif match:
            fence = match.group(1)
            lines.append("\n")
        else:
            lines.append(line)
    return re.sub(r"(`+).*?\1", "", "".join(lines), flags=re.S)


def link_destination(raw):
    """提取路径，移除可选标题，并保留编码或转义的文件名。"""
    raw = raw.strip()
    if raw.startswith("<"):
        closing = raw.find(">")
        return raw[1:closing] if closing >= 0 else ""
    end = 0
    while end < len(raw):
        if raw[end] == "\\":
            end += 2
        elif raw[end].isspace():
            break
        else:
            end += 1
    return raw[:end]


def markdown_link_targets(text):
    """扫描行内链接、图片和引用式定义；括号路径不被提前截断。"""
    text = prose_without_code(text)
    targets = []
    for match in re.finditer(r"(?<!\\)\]\(", text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        if "[" not in text[line_start:match.start()]:
            continue
        start = match.end()
        pos, depth, angle, quote = start, 1, False, None
        while pos < len(text):
            char = text[pos]
            if char == "\\":
                pos += 2
                continue
            if quote:
                if char == quote:
                    quote = None
            elif angle:
                if char == ">":
                    angle = False
            elif char == "<" and pos == start:
                angle = True
            elif char in {"\"", "'"} and pos > start and text[pos - 1].isspace():
                quote = char
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    targets.append(link_destination(text[start:pos]))
                    break
            pos += 1
    reference_re = re.compile(r"^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]+>|[^\s]+)", re.M)
    targets.extend(link_destination(match.group(1)) for match in reference_re.finditer(text))
    return dict.fromkeys(targets)


def check_links():
    docs = set(LINK_DOCS)
    docs.update(NOTES_DIR.rglob("*.md"))
    docs.update(EVIDENCE_DIR.rglob("README.md"))
    for doc in sorted(docs):
        if not doc.is_file():
            add("WARN", doc, "文档不存在，跳过链接检查")
            continue
        for target in markdown_link_targets(read(doc)):
            if target.startswith(("//", "#")):
                continue
            target = target.split("#", 1)[0]
            if not target:
                continue
            scheme = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*):", target)
            if scheme and (
                scheme.group(1).lower() in {"http", "https", "mailto", "tel", "urn", "data", "file", "codex", "app", "plugin"}
                or not re.fullmatch(r"[^:/]+:\d+(?::\d+)?", target)
            ):
                continue
            target = unquote(re.sub(r"\\([\\`*_{}\[\]()#+\-.!<> ])", r"\1", target))
            target_path = (doc.parent / target).resolve()
            if not target_path.exists():
                source_target = re.sub(r":\d+(?::\d+)?$", "", target)
                if source_target != target and (doc.parent / source_target).resolve().is_file():
                    continue
                add("FAIL", doc, f"断链：{target}")


def main():
    parser = argparse.ArgumentParser(description="工作流自检（只读）")
    parser.add_argument("--strict", action="store_true", help="WARN 也视为失败")
    parser.add_argument("--commits", type=int, default=20, help="仅限制提交信息检查数量（默认 20），其他检查仍全量")
    parser.add_argument("--root", type=pathlib.Path, default=ROOT, help="目标项目根目录（默认脚本所在项目）")
    parser.add_argument("--config", type=pathlib.Path, help="配置文件路径，相对目标根目录")
    args = parser.parse_args()
    if args.commits < 0:
        parser.error("--commits 不能为负数；0 表示不读取 Git")
    results.clear()
    try:
        configure(args.root, args.config)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))

    check_notes()
    check_evidence()
    check_releases()
    check_commits(args.commits)
    check_links()

    order = {"FAIL": 0, "WARN": 1}
    results.sort(key=lambda r: (order[r[0]], r[1], r[2]))
    fails = [r for r in results if r[0] == "FAIL"]
    warns = [r for r in results if r[0] == "WARN"]

    print("== 工作流自检 ==")
    print(f"FAIL {len(fails)} · WARN {len(warns)}")
    for level, path, msg in results:
        print(f"[{level}] {path}: {msg}")
    if not results:
        print("全部通过，没有发现问题。")

    if fails:
        return 1
    if warns and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

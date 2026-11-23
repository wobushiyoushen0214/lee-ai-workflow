# 按需阅读：校验脚本

> SKILL §5 的展开。接入 CI 时对照；本地轻量使用时跳过。

本试用包基础校验使用项目根目录的 `python3 scripts/check-workflow.py --strict --commits 0`；下列 TypeScript 工具保留作可选参考，只有项目已有相应运行环境且需要时再接入。

## 可选 TypeScript 校验

1. **`verify-agent-note-tree`**（`scripts/agent-note-tree.ts` + `scripts/verify-agent-note-tree.ts`）
   - 校验 lifecycle 封闭集 `proposed/implemented/rejected` + `archived`、class 封闭集 6 个、路径深度 `{lifecycle}/{class}/file.md`、文件名 `yyyy-mm-dd-topic.md`、禁止 `INDEX.md`。

2. **`verify-agent-note-format`**（`scripts/verify-agent-note-format.ts`）
   - 校验头三行 `# Agent Note:` / 空行 / `Status:` 与 lifecycle 一致、Status 唯一、`## Problem` 首节、per-lifecycle 必需节与禁用节、`## Alternatives considered` 必写、grandfather 仅对 2026-07-05 前有效、禁止 legacy 债务标记。

3. **`verify-archived-agent-notes`**（可选，团队需要冻结清单时再加）
   - Harness 原版校验 `archived/` 单文件 + `Archived: YYYY-MM-DD` + sidecar 哈希 + manifest。本项目默认不带，轻量可先不接。

## 接入建议

- 轻量：使用本包 Python 入口，不要求安装 tsx 或重复跑等价校验。
- 已有 TypeScript 门禁的项目：按需要将前两个接入 `doc-sync`，避免和项目已有检查重复；归档冻结清单只在实际需要时引入。

来源：Harness `scripts/agent-note-tree.ts` / `verify-agent-note-format.ts` / `verify-archived-agent-notes.ts`（本项目为中文单语精简版，不含翻译配对）。

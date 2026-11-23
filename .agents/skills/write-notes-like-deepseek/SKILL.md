---
name: write-notes-like-deepseek
description: 像 DeepSeek 团队一样沉淀 Agent Notes——决策、取舍与验证一处留痕，半年后仍可追溯。Use when making a non-trivial change or decision worth revisiting. 适用于任何仓库
---

# Write Notes Like DeepSeek

> **本试用包适配**：技能随项目携带，不要求全局安装。基础校验统一运行项目根目录的 `python3 scripts/check-workflow.py --strict --commits 0`；§5 的 TypeScript 脚本作为保留的可选参考，不要求安装 tsx。archived 的头块与校验以项目执行手册 §5.1 为准。随包模板统一使用 Validation，并保留 rejected 的 Acceptance criteria。

> **留痕边界**：按 [执行手册](../../../docs/ai-workflow.md) §4.3 判断重要决定；文件数和 S/M/L 不独立触发 Note。已有授权内先记录再推进，询问统一按手册 §4.4；验证记录按 §9 引用，不重复保存全文。

> 从 DeepSeek Harness 提炼的决策沉淀纪律。宿主负责拆任务、排计划；本 Skill 只解决一件事：**为什么这样改、放弃了什么、怎么证明改对了**，都留在一处可检索、可校验的地方。

## 定位

这不是文档生成器，也不是 ADR 模板合集。它的定位是**决策留痕层**——当涉及行为、架构、契约、流程或落盘格式这类半年后会有人回头问"为什么"的地方，用一篇 Agent Note 把 rationale 钉住。包括动手前的选型与被否决的方案——无代码的决定也值得留。

- 只改格式 / 无歧义重命名 / 错别字 → 标 `not applicable`，不写。
- 常规可逆修复恢复明确的既有行为，沿用契约与架构且没有重要取舍 → 简述方案，不写独立 Note；相关行为断言仍需执行。
- 不确定时先定向查影响与契约；重要行为、架构、契约、权限、流程、格式或长期取舍仍须留痕，不以文件多或模块不熟悉自动升级。

一句话判断：**"半年后有人回来看，会想知道为什么这样改吗？"** 会，就写。

> "决策"不重——个人项目里就是"为什么选 A 没选 B"。选型、取舍、踩过的坑，都值得钉住。

## 0. 先探测，再落地

别一上来建全套目录。按宿主现状选型：

1. 有 `AGENTS.md` / `CLAUDE.md` / 贡献指南 → 读它；有 `docs/adr/`、`docs/decisions/`、Issue 模板等既有决策记录 → 沿用，语义映射到本 Skill 的 lifecycle / class 即可。
2. 没有决策记录 → 按需建 `.agents/notes/<lifecycle>/<class>/`；重要决定先建 `proposed`，完成后转 `implemented`，不预建空树。
3. 团队长期仓库 → 建全套 `proposed / implemented / rejected / archived × 6 class`。

## 1. 路径即分类

每条 Note 的路径就是身份：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`

**Lifecycle（状态）：**

- `proposed` — 想法阶段，有了方案但还没落地
- `implemented` — 已落地，与代码同一次提交保持同步
- `rejected` — 审慎否掉的提案，仅当能防止重犯时保留，否则删整组
- `archived` — 已完成且未来参考价值低的 implemented 记录，冻结不可改

**Class（种类，封闭集，新增需改门禁）：**

`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`

> 详见 `references/classification.md`；`refactor` 不单列——用 `simplification` 的判据"可观察行为变了吗"区分。不建集中 `INDEX.md`，用目录与搜索发现。

## 2. 文件格式（门禁强制）

前三行固定：

```markdown
# Agent Note: <标题>

Status: <状态>
```

- `proposed` → `Status: proposed`
- `implemented` → `Status: implemented`
- `rejected` → `Status: rejected — <一句话原因>`

状态必须与所在 lifecycle 文件夹一致；文件名日期是**首次提出日**，状态不带日期。

**Body 骨架：**

- `proposed`：`## Problem` → `## Proposal` → …自由节… → `## Alternatives considered` → `## Acceptance criteria` → `## Risks`
- `implemented`：`## Problem` → `## Decision`（现在时） → …自由节… → `## Alternatives considered` → `## Consequences`
- `rejected`：冻结的 proposal 形态，结论在 `Status:` 行

> 禁止在 `implemented` 中出现 `## Proposal` / `## Plan` / `## Acceptance criteria` 等提案口吻；详见 `references/note-format.md`。
> 每篇 Note 必含 `## Alternatives considered`——没写就重审。
> `implemented` 用现在时描述已落地事实；一条 Note 永远不被改写成另一个决定。

模板见 `templates/`。

## 3. 什么时候写、什么时候改

跟着**做决定的时机**写，不只是提交时补。新建前先搜现有归属——同决定的改动更新那一篇，不另起新篇：

- **有重要决定、还没动手** → 先写 `proposed`（为什么想这么做、考虑过哪几条路）；已有授权内自查后继续，只有手册 §4.4 的未决事项需要询问。明确的选型/否决即使没有代码也可以用 Note 交付；普通只读问答无需留 Note。
- **动手时 / 刚做完** → 写或更新 `implemented`，**最晚与代码同一次提交**，避免遗漏。有 PR 以 PR 为单位，没有就以 commit / 推送批次为单位。
- **改的是已有 Note 对应的决定** → 更新那一篇（事实、路径、验证变了就同步），不另起一篇。
- **决定没被完全取代** → 新旧两篇都留并互链。
- **决定被完全取代** → 新 Note 接管，旧 Note 按归档规则冻结，或按合并规则删除（需保留所有独特 rationale 并修复入链）。

> 判定与流转见 `references/when-to-write.md`，归档与删除见 `references/archiving.md`。

## 4. 怎么写好

- `## Consequences` 同时写**代价和收益**，不是只写"放弃了什么"。
- 自由节（package 拓扑、wire 契约、schema 等）放在 `Decision` 与 `Alternatives` 之间，保持可检索的机制名与 `must / may / never` 时序强调。
- 跨 Note 引用用相对 Markdown 链接 `[topic](../../implemented/architecture/2026-…-….md)`，不要裸数字，以便机械可校验。
- `Validation` 写实际验证方式、覆盖与未验证，并链接原始记录；命令与结果已有记录时直接引用，不为更高 V 编号增加核对。
- 文风与去推导痕迹见 `references/prose-checklist.md`；简化机会见 `references/simplification-checklist.md`。

## 5. 校验

```sh
npx tsx <skill目录>/scripts/verify-agent-note-tree.ts     # 路径、lifecycle、class、文件名
npx tsx <skill目录>/scripts/verify-agent-note-format.ts   # 头块、骨架、Alternatives、禁用词
```

这些是可选的独立 tsx 校验；本包基础路径使用开头的 Python 入口。团队可按需要将校验接入 CI，并约定「重要决定必带 Note」；不把普通小修升级为完整文档流程。详见 `references/verification.md`。

## References

按需加载：

- `references/note-format.md` — 头块与 body 骨架展开
- `references/classification.md` — 6 class 判定与边界
- `references/when-to-write.md` — 何时新建 / 更新 / 流转
- `references/archiving.md` — 归档与合并删除（含"未来参考价值"判定与新增即审计）
- `references/prose-checklist.md` — 行文与去泄露自检
- `references/simplification-checklist.md` — 简化机会自检
- `references/verification.md` — 校验脚本说明

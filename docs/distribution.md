# lee-ai-workflow 安装与升级

上游为 [wobushiyoushen0214/lee-ai-workflow](https://github.com/wobushiyoushen0214/lee-ai-workflow)，包版本见 [workflow-package.json](../workflow-package.json)。只需 Python 3.9+；从 GitHub 获取或更新时需要 Git，首次克隆也可用 gh。

## 首次接入

通过 AI 安装时，先按[安装选择](../templates/install-choice.txt)询问是否同时启用决策画布，优先使用宿主的交互选择框。用户已明确选择时直接执行；普通更新不重复询问。基础安装可以继续，未回答不安装插件。纯终端安装器不显示弹窗，仍按下列命令执行。

克隆上游后执行 `python3 scripts/lee-workflow.py install /path/to/project` 查看计划，加 `--apply` 才写入。已有项目业务文件和 AGENTS 原文保留；遇到同名不同内容先整批拒绝，核对差异后再接入。

接入的范围是手册、此文、适配表、配置、模板、检查器及回归、项目内留痕技能和来源参考。不会复制上游的维护 Note、运行证据、根 README、Git 仓库或业务代码，不执行构建或发布。

填写 [项目适配表](workflow.md) 和 `workflow.config.json`，记录本项目真实命令、设计源、必要特殊要求与发布边界。默认配置接受 `README.md` 或 `report.md` 证据入口；其他名称可设置 `evidence_readmes`。项目内 `.agents/skills/write-notes-like-deepseek/SKILL.md` 提供留痕规则，无需全局安装。

## update

在已接入的项目根目录：

```bash
python3 scripts/lee-workflow.py update
python3 scripts/lee-workflow.py update --apply
```

默认获取登记仓库的主分支，先在临时目录获取上游并完成整批预检。预览不写项目；应用前再次检查文件是否在预览后被修改。单文件原子替换，I/O 失败时还原本批已写文件；另有并发修改的文件保留并报告。

| 内容 | 升级处理 |
|---|---|
| 通用手册、模板、脚本、项目内技能及来源参考 | 基线未变时更新；上游移除且本地未改的受管理文件一并移除 |
| AGENTS | 只替换受管理块，块外字节保留；旧 `momofish-workflow` 标记沿用以兼容已接入项目 |
| `docs/workflow.md`、`workflow.config.json` | 项目适配文件，保留现有内容；新模板字段在升级后按实际需求合并 |
| 业务文件、Note、证据、发布记录 | 不接管、不复制上游维护记录 |
| 本地定制的通用文件 | 上游未变时保留；双方同时变化则整批拒绝，先核对合并 |

需要选择版本或使用已经下载的上游：

```bash
python3 scripts/lee-workflow.py update --ref v1.4.0 --apply
python3 scripts/lee-workflow.py update --ref <提交号> --apply
python3 scripts/lee-workflow.py update --source /path/to/lee-ai-workflow --apply
```

`--ref` 只指定本次获取的版本，之后省略时继续使用主分支。可用 `--repo owner/repo` 指定本次 GitHub 来源；离线 `--source` 不与 `--repo/--ref` 混用。指定旧版本相当于回退流程，同样保留项目适配并执行冲突检查。

## 旧版接入与冲突

没有 `.agents/workflow/installation.json` 的旧项目，update 会停止并提示先登记，避免直接覆盖未知修改：

1. 从 GitHub 获取最新包，对比旧规则、脚本及 AGENTS，保留项目实际命令、既有授权、业务约定与历史记录。
2. 把通用流程文件和受管理入口合并为上游内容；项目差异集中到适配表和配置。
3. 从上游目录执行 `python3 scripts/lee-workflow.py install /path/to/project --adopt --apply`。

adopt 只允许项目适配文件与上游不同，其他已有分发文件及入口块必须相同；不会把任意旧规则登记成可覆盖内容。登记后使用普通 update。

有基线但双方同时改动时，先通过 diff 确定取舍；保留的项目特殊要求写入适配表，再让通用文件与上游一致后重试。没有 force 覆盖选项。

## 安装记录与边界

`.agents/workflow/installation.json` 使用 schema_version 1，记录包名、版本、仓库、默认分支、可确定的干净 Git 提交号、分发文件 SHA-256 与入口块摘要。解压包或修改中的源目录没有干净提交号时记录 null，以文件摘要确定基线。建议随项目提交安装记录以便换机器继续升级。

安装器拒绝越出项目的路径、目标或父目录符号链接、无效安装记录和并发变更。联网失败发生在目标写入之前。安装/升级不提交、推送或发布业务项目；工作流结构自检与相关回归也不证明产品业务正确。

## 决策画布（可选）

决策画布是 lee-ai-workflow 的可选可视化组件。通过标准 MCP 连接支持它的 Agent，查看当前项目的决定、原文引用、验证证据和发布记录，沿用 Markdown、Git 与生命周期规则。Codex 可在右侧浏览器面板展示，其他宿主可打开本地网页。普通工作流安装和更新仍只需要 Python，不依赖画布。

### 在工作流中使用

接入后，在目标项目的新 Agent 会话中说（Codex 支持右侧展示）：

> 打开当前项目的决策画布，在右侧展示。

> 根据历史决定，比较这次方案的取舍，并将结果回填画布。

> 将本次分析保存为 proposed。

Agent 读取项目实际根目录，调用 `decision_canvas` 工具登记工作区，再用 `open_ui` 取得 URL；在 Codex 中通过 `open_in_codex` 的 `placement: right` 打开右侧浏览器，其他宿主使用其浏览器或提供本地链接。也可以显式使用插件的 `$decision-canvas` Skill。仅调用 Skill 就打开画布，不自动分析；已有聊天未加载 MCP 时由 Skill 使用随包 CLI 打开；不以猜测的节点或版本执行保存。

画布按 `workflow.config.json` 读取 `notes_dir`、`evidence_dir`、`evidence_readmes`、`releases_dir`。默认决策仍为 `.agents/notes/`，证据支持 README.md 和 report.md。正文只保留在原 Markdown 文件中；画布元数据在 `.agents/canvas/`。

重要决定仍按执行手册 §5 先写 proposed，完成后转 implemented，否决写 rejected。画布保存 proposed 不表示批准实施，不能自动把历史记录判为过时、已取代或已验证。没有安装画布时直接使用原有文件检索与工作流。

### 一次安装，多项目使用

组件要求 Node.js 22.19+ 和支持 MCP 的 Agent。以下是 Codex 的插件安装方式。完整工作流仓库包含 `plugins/decision-canvas` 源码与运行包；在包含该组件的上游版本中，可以使用标准 marketplace 安装：

```sh
codex plugin marketplace add wobushiyoushen0214/lee-ai-workflow
codex plugin add decision-canvas@lee-ai-workflow
```

本地开发或尚未发布的版本，在本机 lee-ai-workflow 仓库的 `plugins/decision-canvas` 目录执行：

```sh
npm ci --ignore-scripts
npm run install:codex
```

本地安装器创建 `lee-ai-workflow-local` marketplace，打包本机 Node 路径，适合 macOS 桌面环境。远端与本地来源选择一个使用即可；切换时安装并验证新的来源，再卸载旧来源的同名插件，避免重复工具。

插件启用是明确的可选动作，普通 `python3 scripts/lee-workflow.py install/update` 不会安装它、不改全局 Codex 配置、不运行 npm。普通安装只分发本说明与 AGENTS 入口；无需向每个业务仓库复制插件源码或依赖。

AI 安装时选择「工作流 + 决策画布」即覆盖本次插件安装与 marketplace 登记；按所用来源安装完成后再验证，不要求用户为同一安装重复确认。如果只有工作流已授权，先展示选择并等待其结果，不默认启用。

### 其他 Agent

使用宿主支持的 MCP 配置方式，注册标准 stdio 服务：`command` 为本机 Node 可执行路径，`args` 为已准备的 `plugins/decision-canvas/dist/mcp.mjs` 绝对路径。运行包已包含依赖，无需在宿主内运行 npm。工具名为 `decision_canvas`，通过 `add_workspace` 指定项目，再使用 `open_ui` 返回的本地 URL。支持 Agent Plugins 的宿主也可读取便携 `plugin.json` / `mcp.json`；支持 Skill 的宿主可加载随包 `skills/decision-canvas/SKILL.md`。

AI 根据当前宿主选择 Codex 插件安装或标准 MCP 接入，不要在其他 Agent 中强行执行 Codex 安装命令。宿主的配置位置不明确时先查其支持方式，再做配置。本次本机验证覆盖 Codex 与标准 MCP 协议，未逐一实测其他 Agent 的安装界面。

### Token 与执行边界

画布的扫描、搜索、筛选、缩放、拖动、原文预览、布局保存与周期刷新都在本机执行，不调用模型，也不会因页面开着而持续消耗模型 token。Agent 打开画布的工具调用有少量上下文开销；要求 Agent 阅读返回结果、检查截图、分析历史或生成提案时，才有相应的模型输入输出。

画布采用 Notion 风格，提供自动、明亮、暗黑主题。页面没有独立 AI 输入框：选择记录后点击「复制到会话」，将引用粘贴到当前聊天输入框后提问。Agent 使用本聊天的 contextId 读取最新引用并完成分析、回填，结果在聊天展示。引用上下文按打开的会话隔离，服务重启后重新选择。页面不自动向聊天发消息，也不启动另一份 Agent 或要求新的模型密钥。分析片段随当前对话交给其配置的模型；本地记录保存问题、来源 SHA 与输出，项目自行决定是否提交。

### 更新与验证

工作流 `update` 更新受管理的使用文档和入口，不强制升级已安装插件。插件从所选 marketplace 更新；本地开发版修改后重新执行 `npm run install:codex` 并新开聊天。

维护插件时在其目录执行 `npm ci --ignore-scripts`、`npm run build`、`npm test`、`npm run check`；已构建 `dist/` 随源码维护，供 marketplace 直接加载。修改工作流分发文件后执行 `python3 -m unittest discover -s scripts -p 'test_*.py' -v` 和 `python3 scripts/check-workflow.py --strict --commits 0`。

卸载只移除对应来源的插件，例如 `codex plugin remove decision-canvas@lee-ai-workflow-local`。项目 Note、证据、布局与分析记录继续保留。

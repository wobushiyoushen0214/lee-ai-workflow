# lee-ai-workflow

一套按风险选择流程、按验收问题选择验证的 AI 开发工作流。包含执行手册、AGENTS 入口、项目内决策留痕、模板、配置、自检和 install/update。源自 momofish-android，保留[原版参考](reference/README.md)。

当前版本 **1.5.0**。上游：[wobushiyoushen0214/lee-ai-workflow](https://github.com/wobushiyoushen0214/lee-ai-workflow)。工作流与留痕规则随项目携带，无需安装全局 Codex 技能。前一版减少重复截图、验证和文档的六项理由见[决策记录](.agents/notes/implemented/process/2026-11-23-risk-based-workflow.md)。

## 把仓库地址交给 AI

AI 首次安装且用户尚未选择可选组件时，先按[安装选择](templates/install-choice.txt)展示交互选择框：「仅安装工作流」或「工作流 + 决策画布」。已有明确选择就直接执行；普通 update 不重复询问。等待选择时可继续基础安装，没有回答不启用插件。

在目标项目的 AI 会话中直接说：

```text
请按 https://github.com/wobushiyoushen0214/lee-ai-workflow 的 README，
将 lee-ai-workflow 接入当前项目。保留已有业务约定与项目实际命令，
填写适配表并完成相关检查，不提交或发布业务项目。
```

已接入后可以说“update 工作流”。项目 AGENTS 会引导执行更新入口。

## 先看什么

1. [完整工作流](docs/ai-workflow.md)：任务、方案、设计、实现、检查、验证、证据、提交、发布、异常、协作、交接和 DoD。
2. [项目适配表](docs/workflow.md)：填写技术栈、真实命令、测试范围、环境和发布边界。
3. [AI 入口](AGENTS.md)、[模板](templates/README.md)、[决策留痕技能](.agents/skills/write-notes-like-deepseek/SKILL.md)。
4. [来源与原版](reference/README.md)：完整历史工作流和 Android 辅助工具原文。

## 本目录直接试

需要 Python 3.9+。进入本目录：

```bash
python3 scripts/check-workflow.py --strict --commits 0
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

基础路径无第三方依赖、不联网、不构建 Android。自检只是结构和链接校验，不代表产品功能验收。

## 接入别人的项目

需要 Python 3.9+。用 gh 或 Git 获取上游，先预览再实际接入：

```bash
gh repo clone wobushiyoushen0214/lee-ai-workflow
python3 lee-ai-workflow/scripts/lee-workflow.py install /path/to/project
python3 lee-ai-workflow/scripts/lee-workflow.py install /path/to/project --apply
```

没有 gh 时可用 `git clone https://github.com/wobushiyoushen0214/lee-ai-workflow.git`。目标项目必须已存在；接入只写流程文件、追加受管理的 AGENTS 块并登记安装基线，不复制本包 Note、验证证据或根 README。不同内容的同名文件会整批拒绝，不覆盖业务文件。旧入口 `python3 scripts/install-workflow.py /path/to/project --apply` 继续可用。

填写 `docs/workflow.md` 与 `workflow.config.json`，将新入口和项目旧约定统一后，在目标项目启动 AI 会话。非默认路径要同步文档与模板。试用中可明确派任务：

```text
按 docs/ai-workflow.md 修复 <可复现问题>。按风险选路径，重要决定先写 proposed，
已有授权内继续实现；相关检查通过且结果仍有效就收尾，精简记录并引用原始输出。
本轮不提交、不发布。
```

验收看重要决定是否先有方案、每个验收问题是否有合适且有效的证据，并写清未验证项。纯 UI 微调集中修改后做格式/静态检查与最终一次画面核对；截图用于视觉疑点、差异比较或明确要求。交互与状态变化仍有相关断言。

## 更新已接入项目

在目标项目根目录执行；联网升级需要 Git：

```bash
python3 scripts/lee-workflow.py update
python3 scripts/lee-workflow.py update --apply
```

默认获取上游 main。更新保留 `docs/workflow.md`、`workflow.config.json`、AGENTS 块外约定和项目 Note/证据；只有上游改动的受管理文件才替换。本地和上游同时修改同一流程文件或入口块时整批不写，列出冲突供合并。可指定版本或离线源目录，详见[安装与升级](docs/distribution.md)。

此前手工复制的旧版没有安装基线，先由 AI 核对合并流程文件，再用 `install --adopt --apply` 登记；该命令仍拒绝接管与上游不同的通用规则，只允许保留项目适配文件。

## 决策画布（可选）

通过标准 MCP 浏览项目的决定、关系、原文与证据（Codex 支持右侧展示），并在当前对话分析历史。画布展示和本地刷新不调用模型。使用与一次安装见 [决策画布](docs/distribution.md#决策画布可选)，维护源码位于 `plugins/decision-canvas/`。普通工作流 install/update 只分发使用说明，不自动安装插件或增加 Node 依赖。

## 配置与异地自检

```bash
python3 scripts/check-workflow.py --root /path/to/project --strict --commits 0
python3 scripts/check-workflow.py --root /path/to/project --commits 20
```

[配置](workflow.config.json) 支持 Note/证据/发布路径、README/report 等证据入口名、额外入口文档、是否允许尚无发布，以及必需/可选发布文件后缀。路径必须在目标项目内。默认空发布目录合法；写入版本后校验项目配置要求的记录。退出码：0 通过，1 有 FAIL 或 strict 下有 WARN，2 参数/配置错误。

卸载时按 `.agents/workflow/installation.json` 核对受管理文件，仅移除确认属于流程且未定制的内容与 AGENTS 标记块；保留项目适配、决策、证据及业务文件。没有全局技能或命令需要卸载。

## 维护上游

修改流程后同步版本、模板及重要决定，运行相关回归与自检，再提交、推送 main。需要固定版本时创建对应标签；用户的 update 默认跟随 main，`--ref` 可选择某次标签或提交。安装器记录获取的版本、文件摘要和可用的 Git 提交号。提交 issue 或 PR 时说明触发问题、改动原因和实际验证范围。

## 本包验证

历史输出见[提取证据](docs/ux-evidence/2026-11-11-workflow-extraction/README.md)和[精简流程验证](docs/ux-evidence/2026-11-23-risk-based-workflow/README.md)。分发与升级的当前结果见[验证记录](docs/ux-evidence/2026-11-23-managed-updates/README.md)。结构、安装和升级验证不代替业务产品测试，也不表示实际提速比例已测量。

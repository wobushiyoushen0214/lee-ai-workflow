# momofish-android 完整工作流试用包

从 momofish-android 提取的独立工作流，适合交给别人放到自己的项目里试一轮。包含完整执行手册、AI 入口、决策留痕技能、全部常用模板、配置、自检与定向测试、无覆盖接入工具及完整原版快照。

当前版本为 **v1.3-portable（2026-11-23）**：按风险选执行路径，按验收问题选验证，满足停止条件后收尾；日常证据默认精简，重要决定继续留痕。六项调整及原因见 [决策记录](.agents/notes/implemented/process/2026-11-23-risk-based-workflow.md)。

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

在本包目录执行，先预览再实际写入：

```bash
python3 scripts/install-workflow.py /path/to/project
python3 scripts/install-workflow.py /path/to/project --apply
```

目标项目必须已存在。只安装执行手册、适配表、模板、配置、检查器、定向测试、随项目技能和来源参考，创建 Note/证据/发布目录；不复制本包提取记录、验证证据或根目录 README。已有 AGENTS 保留并追加带标记的工作流入口；同名不同内容的文件或未受本包管理的入口标记会整批拒绝，在写文件前列出冲突。相同文件可重复接入，不覆盖业务文件。接入不执行技能、构建、测试、Git 或发布。

填写 `docs/workflow.md` 与 `workflow.config.json`，将新入口和项目旧约定统一后，在目标项目启动 AI 会话。非默认路径要同步文档与模板。试用中可明确派任务：

```text
按 docs/ai-workflow.md 修复 <可复现问题>。按风险选路径，重要决定先写 proposed，
已有授权内继续实现；相关检查通过且结果仍有效就收尾，精简记录并引用原始输出。
本轮不提交、不发布。
```

验收看重要决定是否先有方案、每个验收问题是否有合适且有效的证据，并写清未验证项。纯 UI 微调集中修改后做格式/静态检查与最终一次画面核对；截图用于视觉疑点、差异比较或明确要求。交互与状态变化仍有相关断言。

## 配置与异地自检

```bash
python3 scripts/check-workflow.py --root /path/to/project --strict --commits 0
python3 scripts/check-workflow.py --root /path/to/project --commits 20
```

[配置](workflow.config.json) 支持 Note/证据/发布路径、额外入口文档、是否允许尚无发布，以及必需/可选发布文件后缀。路径必须在目标项目内。默认空发布目录合法；写入版本后校验项目配置要求的记录。退出码：0 通过，1 有 FAIL 或 strict 下有 WARN，2 参数/配置错误。

卸载时仅移除本工具列出的新增文件和 AGENTS 中 `momofish-workflow` 标记块；保留试用中产生的决策/证据及自行修改的文件。没有全局安装或配置需要回退。

## 本包验证

原始提取输出见 [历史提取证据](docs/ux-evidence/2026-11-11-workflow-extraction/README.md)，本轮检查与复跑方式见 [精简流程验证](docs/ux-evidence/2026-11-23-risk-based-workflow/README.md)。历史原版快照和验证输出保留；本包尚未在别人的真实业务项目完成试用，未验证产品构建、设备、发布或实际提速比例。

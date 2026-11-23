# lee-ai-workflow 安装与升级

上游为 [wobushiyoushen0214/lee-ai-workflow](https://github.com/wobushiyoushen0214/lee-ai-workflow)，包版本见 [workflow-package.json](../workflow-package.json)。只需 Python 3.9+；从 GitHub 获取或更新时需要 Git，首次克隆也可用 gh。

## 首次接入

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

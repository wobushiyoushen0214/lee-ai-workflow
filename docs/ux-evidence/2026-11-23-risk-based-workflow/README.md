# 按风险精简工作流验证

## 环境与产物

日期：2026-11-23，Asia/Shanghai。受检范围：v1.3-portable 的入口、手册、适配示例、模板、随包技能和检查器提示。Python 与系统信息见 [environment.txt](environment.txt)。本轮产物是流程文件，不涉及产品构建或设备画面。

## 改动与核对

六项决定与原因只在 [Agent Note](../../../.agents/notes/implemented/process/2026-11-23-risk-based-workflow.md) 记录。

| 检查 | 命令/方法 | 结果与原始输出 |
|---|---|---|
| 完整回归 | `python3 -m unittest discover -s scripts -p 'test_*.py' -v` | 33 项通过，见 [tests.txt](tests.txt)；其中 21 项检查器回归在受检脚本未变时复用 |
| 接入文档后续修正 | `python3 -m unittest discover -s scripts -p 'test_portable_workflow.py' -v` | 12 项定向回归通过，见 [portable-tests.txt](portable-tests.txt)；覆盖安装、模板、配置及冲突保护 |
| 随包技能元数据与主入口 | 临时 `PYTHONPATH` 指向 PyYAML 6.0.3，运行 `skill-creator/scripts/quick_validate.py .agents/skills/write-notes-like-deepseek` | 校验通过，见 [skill-check-isolated.txt](skill-check-isolated.txt)；SKILL.md 未在成功记录后改变，复用结果 |
| 最终 Note 状态、结构与本地链接 | `python3 scripts/check-workflow.py --strict --commits 0 --config <临时配置>`；在原配置的 `link_docs` 中加入根 README，一次检查全部目标 | FAIL 0/WARN 0，退出码 0；见 [workflow-check.txt](workflow-check.txt) |
| 入口一致与历史保护 | 对比根 AGENTS 和接入模板；按修改前 SHA-256 核对 reference、旧验证输出和旧 Note | 入口完全一致，18 个历史文件未变；见 [consistency.txt](consistency.txt) |

复跑前置：Python 3.9+，从包根目录执行；回归使用可自动清理的临时项目，不联网、不安装依赖。技能元数据校验使用 `/Users/lizhiwei/.codex/skills/.system/skill-creator/scripts/quick_validate.py`，需该工具的 YAML 运行环境；它不是接入此包的前置。此前仅为该校验器临时安装 PyYAML，结束后目录已清理，未改项目或全局依赖。

文件摘要清单见 [SHA256SUMS](../../../SHA256SUMS)。从包根目录用 `shasum -a 256 -c SHA256SUMS` 核对，退出码 0 表示清单内文件一致；清单自身、缓存和系统杂项不计入。最终结构自检使用现有配置接口：复制 `workflow.config.json` 到临时文件，在 `link_docs` 加入 `README.md`，通过 `--config` 检查后清理临时文件；期望 FAIL 0/WARN 0。常规复跑可直接用 `python3 scripts/check-workflow.py --strict --commits 0`。

## 边界与交付

两次外部技能校验器因缺少 YAML 运行库失败，不计通过：见 [系统 Python 失败](skill-check.txt) 与 [内置运行时失败](skill-check-bundled.txt)。临时补齐校验器依赖后通过，原始失败输出保留。

未验证真实业务项目的 AI 执行效果、实际耗时改善、产品构建、设备或发布。临时测试项目运行结束后自动清理，没有业务环境变更。当前目录没有 Git 仓库；仅更新本地文件，未提交、推送或发布。本轮无待确认事项。

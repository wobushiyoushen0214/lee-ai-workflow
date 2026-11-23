# 独立工作流试用包提取验证

## 1. 日期与环境

2026-11-11，Asia/Shanghai；Python 与操作系统见 [环境](environment.txt)。本轮针对工作流文件、配置和接入工具，不运行 Android 工程。

## 2. 改动

提取完整手册、项目适配表、AI 入口、常用模板、完整决策留痕技能和原始快照。自检增加 JSON 配置、目标根目录、通用发布记录要求、空发布历史和 Note 结构；接入工具默认预览，实际接入前整批检查冲突，并保留已有 AGENTS 内容。

## 3. 静态校验

工作流严格自检、全包 Markdown 本地目标检查和来源完整性核对，结果分别见 [自检输出](workflow-check.txt)、[全包链接输出](all-links.txt)、[来源校验](source-integrity.txt)。这些结构检查不代替产品行为断言。

## 4. 场景核对

最高 V2，33 个定向用例通过，完整原始输出见 [tests.txt](tests.txt)。

| 场景 | 断言 |
|---|---|
| 原有工作流规则 | 保留 21 个状态、链接、URI、退出码回归用例 |
| 换目录与项目名含空格/中文 | 临时项目接入后从另一个 cwd 运行严格自检，0 FAIL/0 WARN |
| 已有项目接入 | 原 AGENTS 字节前缀保留；重复接入无新增；同名冲突和异常标记在写入前拒绝 |
| 路径边界 | 指向项目外的符号链接拒绝；非法配置返回 2 |
| 配置与发布 | 自定义 Note/证据/发布目录生效；本地发布记录模板可配置；缺必需记录返回 1 |
| 模板 | 四个 lifecycle 模板通过；非法分类和 implemented 的 Proposal 失败 |
| 默认预览与 Git | 接入预览不写文件；commits=0 不调用 Git |

## 5. 证据回答的问题

定向断言回答本包能否独立接入及运行；来源哈希回答原版是否完整且来源文件保持一致。没有截图，此次不是界面改动。

## 6. 范围与差异

没有在别人的真实业务项目完成试用；未运行 Android/Flutter/Web 构建、设备、截图或发布。原版 TypeScript 脚本保留作为可选参考，本轮未运行。结构检查不验证 Markdown 锚点、断言质量或发布摘要。

## 7. 失败记录

首次运行 33 个用例有 3 个失败，不计通过；工具返回摘录见 [first-run-excerpt.txt](first-run-excerpt.txt)。原因是接入时未复制来源参考、根目录入口作为 Markdown 模板在模板目录解析；修复为随包安装完整 reference 和 txt 入口后重新运行 33 个用例通过。临时项目由测试的 TemporaryDirectory 清理，没有改动正式项目或设备环境。

## 8. 对应决定

见 [提取决策](../../../.agents/notes/implemented/process/2026-11-11-portable-workflow-extraction.md)。

## 9. 提交与发布

新目录和同级 ZIP 为本地交付，未提交、未推送、未发布。原 momofish-android 文件未修改，保留用户原有未提交工作。

## 复跑

在包根目录：

```bash
python3 -m unittest discover -s scripts -p 'test_*.py' -v
python3 scripts/check-workflow.py --strict --commits 0
```

期望 33 个用例 OK，自检 FAIL 0 / WARN 0。`SHA256SUMS` 列出所有交付文件的 SHA-256（清单自身除外），ZIP 的 SHA-256 位于同级 .zip.sha256 文件；文件摘要不表示产品行为验收。

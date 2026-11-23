# lee-ai-workflow 分发与受管理升级验证

## 环境与范围

2026-11-23，Asia/Shanghai；本机 Python 3，Git 与 gh。受检为公开包 1.4.0、install/update、安装记录、AGENTS 块保留与结构校验。自动回归使用隔离临时项目，实际 GitHub 获取在推送后补记。

## 核对与输出

- 决定与取舍见[分发记录](../../../.agents/notes/implemented/process/2026-11-23-github-distribution-and-managed-updates.md)。
- [回归输出](tests.txt)：`python3 -m unittest discover -s scripts -p 'test_*.py' -v`，54 项通过，覆盖安装/升级、配置与入口保留、冲突拒绝、I/O 回滚、非法记录/符号链接、重复执行、独立适配 fixture 和结构检查。
- [最初回归失败](tests-initial.txt)不计通过：macOS 临时目录 `/var` 与 `/private/var` 的路径规范化不同，安装记录入口已统一解析根目录后复跑通过。后续本机项目回归发现宿主业务适配污染临时项目，测试使用独立适配源后各 54 项通过；失败与迁移恢复副本仅存本机。
- 三个获授权项目完成通用文件对齐与 adopt，项目命令/设计/环境/发布约定保留；业务与历史文件摘要、Git HEAD 未变。两项目结构 FAIL 0/WARN 0；另一项目保留 7 个原有历史证据 WARN、无新增 FAIL/WARN，strict 非零不计通过。
- 项目内技能与安装记录有效后删除 Codex 全局留痕技能，全局入口改为项目内规则与直接留痕纪律；排除项目未改。此记录不包含业务代码、未提交差异或本机恢复路径。
- [最终结构与链接](workflow-check.txt)：FAIL 0/WARN 0，包含根 README；[入口一致](consistency.txt)通过。文件摘要见根 SHA256SUMS，复跑 `shasum -a 256 -c SHA256SUMS`；不因补写记录重复产品验证。

## 边界与状态

gh 已创建公开上游；代码推送与真实 GitHub 临时项目接入/update 待发布后补记。业务项目的流程修改保留在本地，未擅自提交、推送或发布。工作流验证不代替业务功能、设备、应用安装、发布验收或实际提速测量；相关原始失败保留，不计通过。

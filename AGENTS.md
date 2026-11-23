# 项目协作约定

文档与注释默认使用中文；项目已有明确规范时沿用。

<!-- momofish-workflow:start -->
## AI 工作流

日常任务按 [执行手册](docs/ai-workflow.md) §4.3 的风险选择轻量或完整路径，文件数和任务规模不单独触发完整流程。项目实际命令以 [适配表](docs/workflow.md) 为准；初次接入先填写适配表，不能将模板占位符当作真实命令。

- 用户当前指令及会话中已有授权优先；普通实现选择在授权范围内自主推进。询问边界统一见手册 §4.4；重要决定先记方案，缺独立设计稿时按 §5.3 沿用现有规范，不因此再次确认。
- 重要行为、架构、契约、流程、落盘格式或选型决定执行 [write-notes-like-deepseek](.agents/skills/write-notes-like-deepseek/SKILL.md)：先写 proposed，完成后改 implemented，否决写 rejected；每篇必含 `## Alternatives considered`。
- Note 路径：`.agents/notes/{proposed,implemented,rejected,archived}/{feature,bug-fix,simplification,architecture,process,testing}/YYYY-MM-DD-<kebab-topic>.md`。归档保留 `Status: implemented` 并加 `Archived: YYYY-MM-DD`。
- 仅格式、无歧义重命名、错别字标 `not applicable`；常规可逆修复没有重要取舍时不写独立 Note。行为、契约、数据流、路由、状态机或测试文件改动仍跑相关测试。
- 纯 UI 微调按适配表做格式/静态检查与同批修改完成后的最终一次画面核对，不跑行为测试；截图用于视觉疑点、差异比较或明确要求，额外状态按风险选择。
- 验证按验收问题选择手段；满足手册 §8.4 的停止条件就收尾。结果仍有效时复用；相关新改动、失败、环境变化或明确要求才定向重验。不写、不跑没有断言价值的冒烟测试，不用「没崩」或「编译过」冒充行为正确。
- 日常证据默认精简 README；没有独立输出的小任务可记在回复或已有 Note。决策与原始输出各保留一处，其他位置引用；记录受检范围、相关环境与复跑命令。失败记录保留并标明不计通过；临时状态恢复后补受影响核对。
- 保护用户和其他任务的未提交改动；只提交本任务文件，提交、推送和发布按用户授权执行。
- 交付写：改动 / 实际验证方式、覆盖与证据 / 未验证 / 必要未决事项 / 提交或发布状态；信息可合并表达。V 编号只作方式标签，不要求最高编号。
- 基础自检：`python3 scripts/check-workflow.py --commits 0`；检查历史提交时使用 `--commits 20`；`--strict` 将 WARN 视为失败。
- 修改自检或安装脚本后跑：`python3 -m unittest discover -s scripts -p 'test_*.py' -v`。
- 不安装、加载或执行 Trellis skill、`.trellis` 工作流、ccpanes skill 或 slash command（browse-sessions、dispatch-todos、fork-session、launch-task、parallel-run、plantocodex、spec、workspace、workspace-migrate）。
- 单 Agent 为默认；多 Agent 章节供明确授权的协作使用，不自动启动子 Agent。
- 上游为 [lee-ai-workflow](https://github.com/wobushiyoushen0214/lee-ai-workflow)。已接入项目收到“update 工作流”时按 [升级说明](docs/distribution.md)执行 `python3 scripts/lee-workflow.py update --apply`；保留项目适配、业务约定与记录，冲突先核对，不推送业务项目。留痕使用项目内规则，无需全局技能。
<!-- momofish-workflow:end -->

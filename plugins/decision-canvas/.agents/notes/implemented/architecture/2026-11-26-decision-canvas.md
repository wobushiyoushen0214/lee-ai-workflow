# Agent Note: 独立的决策画布

Status: implemented

## Problem

用户希望在 Codex 中使用 dsh-decision-canvas 与 lee-ai-workflow 的决策回溯能力，并明确要求不修改已有 Harness 插件。原插件的文件索引、关系与布局可以复用，宿主面板、文件服务和原生 AI 接口无法直接加载到 Codex。

## Decision

以独立的 decision-canvas 插件实现，保留来源代码的 MIT 许可和归属。复用 Markdown 解析、检索、关系图和 React Flow 交互，使用 Node.js 本地文件服务、浏览器页面和 MCP 接入 Codex。插件分发包含独立 Skill 与自包含运行包，不依赖 Harness。

决策正文继续由项目 Markdown 管理，支持 lee-ai-workflow 的 workflow.config.json 路径和证据入口配置。画布只保存布局、人工关系与分析记录。AI 分析在当前 Agent 会话中完成：准备并冻结来源、返回分析请求、由 Codex 回填结果、核对来源后保存 proposed。浏览器可复制记录引用到当前聊天输入框，不另行启动模型进程或要求配置新的模型。

## Alternatives considered

- 修改原插件增加 Codex 分支：用户明确要求保留原插件，独立项目能够分开升级和验证。
- 只创建 Skill：可以指导留痕，但无法提供画布、布局和文件版本保护。
- 重新实现全部图形交互：已有 MIT 代码覆盖拖动、筛选、固定与双向引用，复用后只调整独立宿主入口。
- 把正文迁入数据库：会改变 lee-ai-workflow 的 Git、目录身份与校验契约，继续使用 Markdown。
- 从页面启动 codex exec 或直接请求模型：会另起会话并增加模型与鉴权配置，采用当前对话完成分析及回填。
- 使用 Codex 未公开的面板扩展接口：无法验证可维护性，页面通过受支持的本地浏览器入口打开。

## Validation

40 项行为测试、构建、语法和 Skill 检查通过。安装缓存中的 MCP 完成真实握手、读取、分析回填和本地页面请求；Codex 右侧浏览器实际核对搜索、列表、原文、来源检索和布局保存。验证与限制见 [验证记录](../../../../VALIDATION.md)。

## Consequences

历史决定可在 Codex 的右侧页面中回溯，分析使用当前对话并保留来源。纯展示、检索、拖动和刷新不调用模型。代价是维护本地 Node 服务、MCP 协议、浏览器构建产物和文件版本锁；分析请求仍需由当前 Agent 对话执行。

## Risks

复制的上游模块需要独立维护。当前对话的分析需要 Codex 调用回填工具，页面不能自行把消息发入正在运行的聊天。图的引用覆盖取决于原始文档链接。新聊天优先加载插件工具；已有聊天可使用随包 CLI 打开与读取同一服务的引用。

## 工作流接入

用户随后要求结合 lee-ai-workflow，源码归入其可选 plugins/decision-canvas 组件，原 Harness 插件保持独立。基础 install/update 只同步画布使用入口，插件通过 marketplace 单独启用。聚焦边框修正属于纯 UI 微调，独立决策留痕为 not applicable。

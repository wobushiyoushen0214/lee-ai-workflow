# 决策画布

面向支持 MCP 的 Agent 的本地决策画布，兼容 **lee-ai-workflow**。查看项目历史决定、引用关系、原文、验证证据和发布记录，并使用当前 Agent 会话生成有来源的分析。Codex 可在右侧浏览器面板中展示。

本插件作为 lee-ai-workflow 的可选组件维护，源码与原 dsh-decision-canvas 分开，不依赖 DeepSeek Harness 运行时。来源和许可证见 [UPSTREAM.md](UPSTREAM.md)。

## 已有能力

- Notion 风格，自动 / 明亮 / 暗黑主题；自动模式跟随浏览器的系统配色偏好，宿主单独设色时可手动匹配。
- 无限画布、自动布局、节点拖动与固定、双向引用、人工关系、搜索、分类与生命周期筛选、时间列表。
- Markdown 原文、图片预览、Git 历史、断链提示和 JSON Canvas 导出。
- 读取项目 `workflow.config.json` 中的 `notes_dir`、`evidence_dir`、`evidence_readmes`、`releases_dir`；默认支持 README.md 和 report.md 证据入口。
- 在当前 Agent 会话中完成提案、总结、比较、问答和复审；分析保存来源 SHA，回填和保存前检查来源与文件版本。
- 新提案以 proposed 创建，不覆盖现有文件，AI 引用转换为真实相对链接。

## 安装到 Codex

需要 Node.js 22.19+、Git 和支持本地插件的 Codex CLI。源码首次安装：

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run install:codex
```

安装器仅增加 `lee-ai-workflow-local` 本地 marketplace 及本插件。插件包在 `.release/`，包含已打包的浏览器和 MCP 服务，不需要在插件缓存中安装依赖。为支持 macOS 图形界面的 PATH，打包时记录本机 Node 绝对路径；换机器或移动 Node 后重新打包安装。

安装后在目标项目**新开 Codex 聊天**，说：

> 打开当前项目的决策画布，在右侧展示。

也可以直接输入 `$decision-canvas`，或在插件选择器中选择「决策画布」：只打开页面，不自动分析。Skill 优先调用 MCP 得到页面地址；已有聊天未加载工具时使用随包 CLI，然后通过 Codex 的 `open_in_codex` 打开右侧浏览器标签。画布是可交互的本地网页，运行依赖相应 MCP 进程或本地服务；没有固定的原生侧栏入口。

更新源码后重新执行 `npm run install:codex`，再新开聊天。卸载插件使用 `codex plugin remove decision-canvas@lee-ai-workflow-local`；需要时再移除 marketplace：`codex plugin marketplace remove lee-ai-workflow-local`。项目正文、布局和分析记录保留。

## 其他支持 MCP 的 Agent

使用宿主的标准 MCP 配置，`command` 指向 Node.js 22.19+，`args` 指向本插件的 `dist/mcp.mjs` 绝对路径。构建产物已包含运行依赖；无需使用 Codex CLI。工具名是 `decision_canvas`，`add_workspace` 接收项目绝对路径，`open_ui` 返回本地页面地址。支持 Agent Plugins 的宿主可加载根目录 `plugin.json` 和 `mcp.json`，Skill 位于 `skills/decision-canvas/SKILL.md`。

其他宿主的具体安装界面尚未逐一验证；标准 stdio MCP 握手与工具调用已有集成测试。

## 使用当前 Agent 分析

可以在聊天中说：

> 根据项目的历史决定，比较这次缓存策略的可选方案，并把分析结果回填画布。

Agent 会检索历史、准备分析、在当前对话完成推理，再回填结果。在画布选中记录并点击「复制到会话」，将引用粘贴到当前聊天输入框后提问即可。Agent 读取本聊天保留的 contextId，取到最新引用；结果展示在聊天，分析留痕由后台保存。每个打开会话的引用独立，重启服务后需重新选择。页面本身不启动模型；无需额外模型 API 密钥。

需要落盘提案时说「将这次分析保存为 proposed」，也可以在画布中新建并手工编辑提案。保存 proposed 不表示批准实施，后续状态流转遵循项目的 lee-ai-workflow。

## 独立启动和开发

```sh
npm run build
node cli.js serve /absolute/path/to/project
```

终端返回本机页面 URL。可传多个项目路径，也可在页面中添加。服务只监听 `127.0.0.1`；URL 中的临时令牌用于本地连接。工作区列表仅保存在服务内存中；插件可在每个新聊天按当前项目重新登记。

只读检索示例：

```sh
printf '%s' '{"query":"缓存策略","scope":"workspace"}' | node cli.js invoke /absolute/path/to/project retrieve
```

安装包也支持 `node dist/cli.mjs serve /absolute/project`；其返回的完整 URL 可用于 `node dist/cli.mjs request <URL> references`（stdin 为 `{"includeContent":true}`），与页面共享同一服务的引用。

`npm run build` 打包浏览器、CLI 与 MCP；`npm test` 覆盖文件解析、画布布局、版本冲突、Agent 分析状态和真实 stdio MCP 握手；`npm run check` 校验语法与分发入口。具体本机验收见 [VALIDATION.md](VALIDATION.md)。

## 文件契约

| 文件 | 内容 |
| --- | --- |
| 项目配置指定的 Note 目录，默认 `.agents/notes/` | 决策正文，仍由 Markdown/Git 管理 |
| `.agents/canvas/decisions.json` | 布局、人工关系、隐藏引用与改名映射，兼容原画布 schemaVersion 1 |
| `.agents/canvas/runs/<id>.json` | Agent 分析问题、来源片段与 SHA、输出及状态，标记 `engine: agent-conversation` |

画布需要主动保存；浏览器每 3.5 秒检查文件变化。文件替换使用版本校验和跨进程锁，冲突要求重新加载。进程在持锁时异常退出可能残留 `.lock` 目录：确认已无相关保存进程后移除对应锁再重试，程序不会自行猜测并删除活动锁。

原 Harness 的分析记录不会被当作 Agent 分析继续执行。新的分析与布局可以和原插件读取同一项目；两个宿主同时修改同一文件时仍应避免竞争，独立程序的锁协议不约束其他编辑器。归档、实施或否决状态不由画布自动判断。

## License

MIT；保留 React Flow attribution。打包依赖声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

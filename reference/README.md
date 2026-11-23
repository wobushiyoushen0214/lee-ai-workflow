# 来源与完整原版参考

提取日期：2026-11-11。来源为 momofish-android 当前工作区中的工作流文件，以及 write-notes-like-deepseek 本地技能。源码文件的 SHA-256 见 [来源清单](source-manifest.json)。

完整原版按 `.txt` 保存，内容逐字保留，含历史项目路径、设备号、发布站点和旧链接；它们只是来源事实，没有携带签名文件、凭据、APK、业务源码或历史大图库。原版链接依赖原工程，不能当成本包可访问的证据。

- [AGENTS.md](momofish-android/AGENTS.md.txt)
- [docs/ai-workflow.md](momofish-android/docs/ai-workflow.md.txt)
- [docs/workflow.md](momofish-android/docs/workflow.md.txt)
- [scripts/check-workflow.py](momofish-android/scripts/check-workflow.py.txt)
- [scripts/test_check_workflow.py](momofish-android/scripts/test_check_workflow.py.txt)
- [scripts/run-ui-audit.py](momofish-android/scripts/run-ui-audit.py.txt)
- [scripts/build-emulator-acceptance.py](momofish-android/scripts/build-emulator-acceptance.py.txt)
- [.agents/notes/implemented/process/2026-11-04-workflow-consistency.md](momofish-android/.agents/notes/implemented/process/2026-11-04-workflow-consistency.md.txt)

通用执行版本保留完整 G0–G9、异常、协作、模板、DoD 和附录；附录 A 改为项目适配。Python 自检增加根目录与 JSON 配置、空发布历史、通用发布后缀、Note 头块和分类校验。日常验收使用随包 Python 入口。

Android `run-ui-audit.py` 绑定原包名、Activity、设备号和测试夹具，`build-emulator-acceptance.py` 绑定历史图库路径；保存完整原文便于研究，安装工具不把它们复制为可执行脚本。若要适配截图链路，需先准备目标项目自己的测试宿主、隔离数据、截图输出和设备参数。

随包技能保留所有 references、脚本及 package.json；三个模板与执行手册对齐，SKILL 增加本包校验入口说明。原版 TypeScript 校验需要 Node/tsx，未在本轮执行；Python 基础工作流不依赖它们。来源材料的许可证与归属沿用来源；本包不新增未经来源声明的许可。

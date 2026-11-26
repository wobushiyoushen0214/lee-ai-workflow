# Source attribution

This is an independent agent-compatible edition, initially derived from the MIT-licensed
`dsh-decision-canvas` 1.0.3, commit
`457425e87871e3bc16bf61c790057917d62dabc9`.

The Markdown parser, relation graph, retrieval, board schema, history reader,
React Flow canvas, layout routines and related tests originate from that project.
The original license is retained in LICENSE. Browser and MCP dependency licenses
are included in THIRD_PARTY_NOTICES.md.

The local filesystem adapter, MCP transport, HTTP server, agent conversation
analysis protocol, workflow configuration support, standalone browser entry,
Codex Skill and plugin packaging are maintained in this project. The original
Harness plugin remains unchanged; this edition is maintained inside lee-ai-workflow.

## Visual design

The light theme adapts the MIT Notion design tokens from
[openvetta/vetta-design-templates](https://github.com/openvetta/vetta-design-templates/tree/dabefd49edf9ca3054c8f92e37a8a928a3472bbd/templates/notion),
commit `dabefd49edf9ca3054c8f92e37a8a928a3472bbd`. The dark theme is a local adaptation.
Vetta attribution and its full MIT license are retained in [DESIGN-LICENSE.txt](DESIGN-LICENSE.txt).

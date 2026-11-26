# Decision Canvas

This is an independent Agent-compatible project. This plugin is an optional component of lee-ai-workflow. Do not modify the original dsh-decision-canvas repository. Do not install, read, or execute Trellis or ccpanes workflows.

Use `npm run build`, `npm run check`, and the tests relevant to behavior changes. Verify meaningful UI changes in the browser. Decision files remain Markdown; never move their content into a database.

Important decisions begin in `.agents/notes/proposed/<category>/` and move to implemented when delivered. Every decision includes `## Alternatives considered`. Do not treat saving a proposed note as permission to implement it.

The plugin's Skill reads the target project's own workflow instructions; it does not install a global lee-ai-workflow or replace project rules. Analysis runs use the current Agent conversation, with frozen source hashes and a versioned completion operation.

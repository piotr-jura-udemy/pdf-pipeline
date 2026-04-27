---
name: code-review
description: Run the code-reviewer subagent on demand. With no args, reviews all uncommitted changes. With a file path as the argument, reviews only that file's uncommitted changes.
---

Dispatch the `code-reviewer` subagent via the Agent tool.

- If `$ARGUMENTS` is empty: ask the agent to review all uncommitted changes.
- If `$ARGUMENTS` is a file path: ask the agent to review only the uncommitted changes for that file (the agent should still use `git diff -- <path>` and `git status -- <path>`).

Pass the user's argument verbatim into the prompt. Do not perform the review yourself — delegate to the subagent and relay its output.

# Agent UI baseline: what users see during agent work and review

Researched 2026-10-23, from official docs first. Codex docs now live at learn.chatgpt.com (the Codex app has become the ChatGPT desktop app), and Windsurf docs redirect to docs.devin.ai. **[U]** = not confirmed in first-party docs.

## 1. Claude Code (CLI, Desktop, web, VS Code)

- **Activity:** `Ctrl+O` opens the transcript viewer, which expands collapsed lines (for example "Called slack 3 times") and shows a timestamp and model on each message ([interactive](https://code.claude.com/docs/en/interactive-mode)). Desktop offers Normal, Thinking and Verbose views ([desktop](https://code.claude.com/docs/en/desktop)).
- **Plan/todo:** `Ctrl+T` toggles the to-do checklist ([interactive](https://code.claude.com/docs/en/interactive-mode)). Plan mode explores without editing ([desktop](https://code.claude.com/docs/en/desktop)). In VS Code, the plan opens as Markdown that you can comment on inline ([vs-code](https://code.claude.com/docs/en/vs-code)).
- **Diffs:**
  - Desktop: a `+N -N` Changes card, comments on any line, all comments sent in one batch ([desktop](https://code.claude.com/docs/en/desktop)).
  - VS Code: side-by-side diff with Accept/Reject for each change ([vs-code](https://code.claude.com/docs/en/vs-code)).
  - Web: compare against any branch ([cloud](https://code.claude.com/docs/en/claude-code-on-the-web)).
- **Preview:** Desktop has a Browser pane with a dev-server menu and element selection. "Auto-verify" takes screenshots, inspects the DOM and fixes issues after edits ([desktop](https://code.claude.com/docs/en/desktop)).
- **Checks:** PR CI status, "Auto-fix" and "Merge when ready". `/code-review` returns a card grouped by file with "Apply fixes" ([desktop](https://code.claude.com/docs/en/desktop)).
- **Context:** a Context card showing a percentage with a breakdown by category, plus `/context` ([desktop](https://code.claude.com/docs/en/desktop)). VS Code adds a prompt-cache countdown ([vs-code](https://code.claude.com/docs/en/vs-code)).
- **Control:**
  - Permission modes: Manual, Accept edits, Plan, Auto (classifier) and Bypass ([desktop](https://code.claude.com/docs/en/desktop)).
  - `Shift+Tab` cycles modes, `Esc` interrupts, messages sent mid-turn queue ([interactive](https://code.claude.com/docs/en/interactive-mode)).
  - Lifecycle hooks ([hooks](https://code.claude.com/docs/en/hooks)).
- **History:** a checkpoint for each prompt. `/rewind` restores code, conversation, or both, or summarizes. Rewind does not cover files changed only by Bash or most subagent edits ([checkpointing](https://code.claude.com/docs/en/checkpointing)).
- **Parallel:**
  - Desktop: a Background tasks pane (subagents and shells), a worktree per session, and split view ([desktop](https://code.claude.com/docs/en/desktop)).
  - Cloud: parallel `--cloud` sessions, and `--teleport` pulls a session into the terminal ([cloud](https://code.claude.com/docs/en/claude-code-on-the-web)).

## 2. OpenAI Codex (CLI, IDE, app, cloud)

- **Activity:** commands and diffs stream into the transcript ([cli](https://learn.chatgpt.com/docs/codex/cli.md)). `/ps` lists background terminals ([commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)).
- **Plan/todo:** `/plan` switches to plan mode. `/goal` sets a persistent objective you can pause or resume ([commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)). **[U]** No rendered CLI step checklist is documented.
- **Diffs:**
  - CLI: `/diff`, including untracked files ([commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)).
  - App review pane: Unstaged / Staged / Commit / Branch / **Last turn** scopes across several repos. It shows the whole repo state, not only the agent's edits ([code-review](https://learn.chatgpt.com/docs/code-review.md)).
- **Review:** `/review` can target a base branch, uncommitted changes, a commit, or custom instructions, and returns prioritized findings without changing the working tree. In the app, findings appear as inline comments, and an optional "Detached" setting runs the review in a separate chat ([code-review](https://learn.chatgpt.com/docs/code-review.md)).
- **Preview:** the built-in browser previews localhost, and "Annotate" lets you comment on elements ([browser](https://learn.chatgpt.com/docs/browser.md)).
- **Context:** the footer shows "% context left". `/status` shows tokens and writable roots ([cli](https://learn.chatgpt.com/docs/codex/cli.md), [commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)).
- **Control:**
  - Sandbox modes: `read-only`, `workspace-write`, `danger-full-access`. Approval policies: `on-request`, `never` (`untrusted` retired). The "Auto" preset is workspace-write plus on-request ([approvals](https://learn.chatgpt.com/docs/agent-approvals-security.md)).
  - "Auto-review" hands boundary approvals to a reviewer agent ([auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review.md)).
  - You can steer the active turn ([cli](https://learn.chatgpt.com/docs/codex/cli.md)).
- **History:** `Esc Esc` forks the chat from an earlier message. `/fork`, `/resume` and `/compact` ([commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli)). The IDE docs recommend making your own git checkpoints ([ide](https://learn.chatgpt.com/docs/codex/ide.md)).
- **Cloud:** you publish an environment after reviewing its setup and test results. Each task gets its own workspace. Results go to review, follow-up, commit or PR ([cloud](https://learn.chatgpt.com/docs/cloud.md)).
- **Parallel:**
  - Worktrees, with "Hand off" moving work between Local and Worktree ([worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees.md)). Subagents ([cli](https://learn.chatgpt.com/docs/codex/cli.md)).
  - **[U]** Best-of-N via `codex cloud exec --attempts`, reported only by a third party ([blog](https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/)).

## 3. Cursor (Agent, Agents Window, Cloud Agents)

- **Activity/history:** checkpoints sit in the chat timeline. You can preview files at a checkpoint, then restore (restores files only, kept separate from git). Transcripts are searchable ([overview](https://cursor.com/docs/agent/overview.md)).
- **Plan:** Plan Mode asks clarifying questions and produces an editable Markdown plan, with "Save to workspace" ([plan](https://cursor.com/docs/agent/plan-mode.md)). `/goal` ([overview](https://cursor.com/docs/agent/overview.md)).
- **Diffs:**
  - The Agents Window's "New diffs view" covers review, commit and PRs ([agents-window](https://cursor.com/docs/agent/agents-window.md)).
  - **[U]** A Review panel with Keep All / Undo All and per-file accept is described only in forums ([forum](https://forum.cursor.com/t/how-to-navigate-to-the-changes-made-in-chat-to-accept-or-reject-them/145639)). Users report that shell edits are missing from it ([forum](https://forum.cursor.com/t/agent-edits-made-via-the-terminal-script-shell-writes-dont-appear-in-the-inline-edit-review-ui/162348)).
- **Review:** Agent Review, Quick or Deep. Runs automatically, via `/agent-review`, or from Source Control against main ([agent-review](https://cursor.com/docs/agent/agent-review.md)).
- **Preview/checks:**
  - The Browser tool navigates, takes screenshots, and reads the console and network ([browser](https://cursor.com/docs/agent/tools/browser.md)).
  - Cloud agents attach screenshots, videos and logs as verification artifacts, and you can take over their remote desktop ([cloud-agent](https://cursor.com/docs/cloud-agent.md)).
- **Control:** Run Modes are Auto-review (sandbox plus classifier) or Allowlist ([run-modes](https://cursor.com/docs/agent/security/run-modes.md)). Queued messages can be reordered, and "Send now" steers at the next tool call ([overview](https://cursor.com/docs/agent/overview.md)).
- **Parallel:**
  - Parallel agents in worktrees, cloud subagents, and `/autopilot` ([agents-window](https://cursor.com/docs/agent/agents-window.md)).
  - **`/best-of-n sonnet,gpt,composer <task>`** runs the task once per model, each in its own worktree. It compares only; `/apply-worktree` brings in the chosen result ([worktrees](https://cursor.com/docs/configuration/worktrees.md)).

## 4. GitHub Copilot coding (cloud) agent

- **Flow:**
  - A task starts from the agents panel, an issue or a PR, and runs in an ephemeral Actions environment.
  - Setup comes from `copilot-setup-steps.yml`, with a 59-minute cap ([about](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)).
  - **[U]** Draft-PR and eyes-reaction details were not on the pages I fetched.
- **Progress:** a session log shows reasoning, tools and validation runs, plus token usage and duration. Commits link back to their session ([track](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions)).
- **Control:**
  - The prompt box steers after the current tool call, and "Stop session" keeps pushed commits ([track](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions)).
  - CI runs only after a human clicks "Approve and run workflows", and the requester can't approve the PR ([responsible-use](https://docs.github.com/en/copilot/responsible-use/copilot-coding-agent)).
  - Firewall blocks are reported in the PR ([firewall](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall)).
- **Checks:** before opening the PR, the agent self-reviews with Copilot code review and runs code, secret and dependency scans. Both appear in the logs ([blog](https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/)).
- **Other:** per-task model picker, custom agents in `.github/agents/`, and "Continue in Copilot CLI" ([blog](https://github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/)).

## 5. Quick looks

- **Devin:**
  - Shell, IDE (you can take over) and an Interactive Browser ([intro](https://docs.devin.ai/get-started/devin-intro)).
  - A Progress tab where clicking a step shows its detail ([session tools](https://docs.devin.ai/de/work-with-devin/devin-session-tools)).
  - Session Insights builds a timeline on demand ([insights](https://docs.devin.ai/product-guides/session-insights)).
- **Jules:**
  - You approve a plan before any code changes; if you leave, it auto-approves on a timer. You can give feedback in chat mid-task ([review-plan](https://jules.google/docs/review-plan/)).
  - Runs in a VM and sends browser notifications ([docs](https://jules.google/docs/)). **[U]** Diff and PR UI.
- **Windsurf Cascade:** Todo list, named checkpoints (reverts can't be undone), Auto-Continue past 40 invocations, and several Cascades at once, which can race on the same file ([cascade](https://docs.devin.ai/desktop/cascade/cascade)).

## 6. Baseline Bezl must match

1. A collapsible activity stream and a todo/plan view.
2. Plan mode with an editable plan.
3. Diffs with line comments, per-change accept/reject, and scopes for last turn and base branch.
4. A context/token meter.
5. Tiered permissions, including a classifier tier.
6. Steering through a queue.
7. Rewind.
8. Parallel sessions, each in its own worktree.
9. Review with prioritized findings.
10. A PR/CI card with auto-fix.
11. A browser preview with element comments.

## 7. Gaps a multi-vendor supervisor can own

1. **Cross-vendor review.** Every built-in reviewer comes from the same vendor as the writer: Codex `/review`, Claude `/code-review`, Copilot self-review, Cursor Agent Review. Cursor's `/best-of-n` mixes models, but to compare implementations, not to review one. None makes another vendor's independent verdict a gate.
2. **Structured comparison.** Best-of-N exists (Cursor, and Codex **[U]**). No docs describe a side-by-side diff of the candidates, a matrix of which reviewer flagged what, or a log of where reviewers disagree.
3. **Evidence trail.** Copilot session links, Cursor artifacts and Devin insights are each locked to one vendor. None ties a claim like "tests pass" to the command, output and SHA that prove it, across agents.
4. **Complete rewind.** Claude's rewind skips Bash and subagent edits ([checkpointing](https://code.claude.com/docs/en/checkpointing)), and Cursor's review UI reportedly misses shell edits. Git snapshots of the worktree, taken by the supervisor, cover every tool.
5. **Previews per candidate.** None lets you preview candidate A's and B's worktrees side by side, each annotated with its reviewers' findings.
6. **One permission policy.** Each vendor has its own modes (Auto, Approve for me, Auto-review). A supervisor could set one policy and translate it into each CLI's flags.
7. **Comparable cost.** Each tool meters only itself. None shows tokens, cost and time for each agent side by side.

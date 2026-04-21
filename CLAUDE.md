# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs. Ask if uncertain.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask clarifying questions before implementation, not after mistakes.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative. Prefer the simple approach.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Language & Testing

**Always use TypeScript.** No plain JavaScript — types are part of the contract.

**Test features with unit tests. Avoid mocking.**
- Prefer real implementations over mocks. Mocks drift from reality and hide integration bugs.
- If something is hard to test without mocks, treat that as a design signal, not a reason to mock.
- Only mock true external boundaries you cannot reach (third-party APIs, network, time) — and only when necessary.

## 6. Document Decisions

**Code alone isn't enough. Explain the why.**

Avoid the failure mode where:
- It works, but no one knows how.
- If it breaks, no one knows why.
- Zero documentation exists for decisions made.
- Others must re-analyze the project just to understand what it does and why it exists.

Leave behind enough context — in commits, comments where the *why* is non-obvious, or project docs — that a future reader (human or LLM) can reconstruct intent without archaeology.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

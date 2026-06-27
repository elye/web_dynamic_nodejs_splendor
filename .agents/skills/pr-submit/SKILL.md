---
name: pr-submit
description: Create, update, and safely submit GitHub pull requests from a branch using `gh`. Use when the user asks to make a PR, submit a PR, open a pull request, update PR text, or automate PR creation. Always write multi-line PR bodies to a file and pass `--body-file` so backticks and shell quoting cannot corrupt the description.
---

# PR Submit

Use this skill when the task is to turn a finished branch into a pull request.

## Goal

Submit a PR without losing markdown formatting, validation commands, or code spans in the body.

## Workflow

1. Confirm the branch is ready.
   - Check `git status --short --branch`.
   - If needed, inspect the commit range with `git log --oneline --decorate -n 5`.
   - If the work is not committed yet, commit it before creating the PR.

2. Confirm the branch is pushed.
   - Use `git push -u origin <branch>` when the branch is new.
   - If the branch already tracks a remote, a plain `git push` is fine.

3. Compose the PR title and body in files, not inline shell arguments.
   - Write the body to a temporary file.
   - Use a single-quoted heredoc or another file-based approach.
   - Never paste a multi-line body directly into `gh pr create --body`.
   - Never rely on shell interpolation for code spans, backticks, or `$()` in the PR text.

4. Create or update the PR with `gh`.
   - If no PR exists for the branch, run `gh pr create --base main --head <branch> --title "..." --body-file <file>`.
   - If a PR already exists, run `gh pr edit <number> --title "..." --body-file <file>`.
   - If the PR body needs a quick fix, always prefer `--body-file` over `--body`.

5. Verify the result.
   - Read back the PR with `gh pr view <number> --json title,body,url`.
   - Confirm the body preserved markdown code spans and validation commands.

## Safety rules

- Use `--body-file` for any body with more than one line.
- Use `--title` for the short summary only.
- If the body includes backticks, code snippets, or shell commands, assume inline shell arguments will mangle it.
- If the PR already exists, update it instead of creating a duplicate.
- If `gh` is unavailable or unauthenticated, stop and explain the blocker.

## Suggested body template

```md
## Summary
- What changed
- Why it changed

## Validation
- `command 1`
- `command 2`
```

## Common mistake to avoid

Do not use inline `--body` strings for markdown that contains backticks. That is how PR text gets mangled.
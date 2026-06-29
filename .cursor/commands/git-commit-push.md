# Git Commit and Push

## Overview

Stage changes, create a short focused commit, and push the current branch to origin — without asking the user unless something fails or requires a decision (e.g. force push).

## Steps

1. **Review changes**
    - `git status`
    - `git diff` (unstaged) and `git diff --cached` (staged)
    - Understand what changed and why
2. **Ask for issue key (optional)**
    - Check the branch name for an issue key (Linear, Jira, GitHub issue, etc.)
    - If an issue key (e.g., POW-123, PROJ-456, #123) is not already available in the chat or commit context, optionally ask the user if they want to include one
    - This is optional — commits can be made without an issue key
3. **Stage changes (if not already staged)**
    - `git add -A`
    - Do not stage secrets (`.env`, credentials, etc.) — warn the user if they try to commit them
4. **Create short commit message**
    - Base the message on the actual changes in the diff
    - Example: `git commit -m "fix(auth): handle expired token refresh"`
    - Example with issue key: `git commit -m "PROJ-123: fix(auth): handle expired token refresh"`
5. **Commit**
    - If the commit fails due to a pre-commit hook, fix the issue and create a **new** commit (do not amend unless the user explicitly asked)
6. **Fetch and rebase onto latest main (optional but recommended)**
    - `git fetch origin`
    - If not on `main`, rebase onto latest: `git rebase origin/main || git rebase --abort`
7. **Push current branch**
    - `git push -u origin HEAD`
8. **If push rejected due to remote updates**
    - Rebase and push: `git pull --rebase && git push`
    - If you need to force push after a rebase, ask the user first: `git push --force-with-lease`

## Commit message template

- `git commit -m "<type>(<scope>): <short summary>"`
- With issue key: `git commit -m "<issue-key>: <type>(<scope>): <short summary>"`

## Commit rules

- **Length:** <= 72 characters
- **Imperative mood:** Use "fix", "add", "update" (not "fixed", "added", "updated")
- **Capitalize:** First letter of summary should be capitalized
- **No period:** Don't end the subject line with a period
- **Describe why:** Not just what — "fix stuff" is meaningless

## Notes

- Prefer `rebase` over `merge` for a linear history.
- Never force push to `main`/`master` without explicit user approval.
- Return the commit hash and confirm the branch was pushed to origin.

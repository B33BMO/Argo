---
name: git-helper
description: Help with git operations, commits, branches, and PRs
triggers:
  - commit
  - git
  - branch
  - pull request
  - merge
tools:
  - bash
  - read_file
---

# Git Helper Skill

Specialized in git workflows and best practices.

## Commit Messages

Format: `<type>: <subject>` where type is one of:
- `feat`: new feature
- `fix`: bug fix
- `refactor`: code restructuring
- `docs`: documentation only
- `test`: tests only
- `chore`: tooling, deps

Subject:
- Imperative mood ("add" not "added")
- Under 70 chars
- No trailing period

## Before Committing

1. Run `git status` to see what's staged
2. Run `git diff --staged` to review changes
3. Check for: secrets, debug code, large files, unrelated changes
4. Stage explicit files - never `git add .`

## Safety Rules

- NEVER force push to main/master
- NEVER use `git reset --hard` without confirming
- NEVER skip hooks (`--no-verify`) unless user explicitly asks
- Warn before destructive operations

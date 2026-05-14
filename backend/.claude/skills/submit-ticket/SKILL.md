---
description: Submit a ticket to another team. Use when you need something another component owns.
argument-hint: "[target-team] short description of what you need"
---

You are the **backend** component submitting a ticket to another team.
`$ARGUMENTS` format: first word = target team (`frontend` | `agent` | `contracts` | `human`), remainder = short description.

---

## Step 1 — Set up GitHub CLI auth

Detect platform by running `uname -s 2>/dev/null || echo windows`.

**bash / Git Bash / Mac / Linux:**
```bash
export PATH="$PATH:/usr/local/bin:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep password | cut -d= -f2)
gh auth status
```

**Windows PowerShell:**
```powershell
$env:PATH = "$env:PATH;C:\Program Files\GitHub CLI"
gh auth status
```

If still not logged in after either block:
```bash
gh auth login --with-token <<< "$GH_TOKEN"
```
If that also fails: **stop and tell the user** "gh auth failed — please run `gh auth login` manually and retry `/submit-ticket`."

---

## Step 2 — MANDATORY: Search before creating

Extract 3–5 keywords from your description and search:
```bash
gh issue list --repo SankaiAI/outcomeX --state open --search "YOUR KEYWORDS"
```

Read every result title.

- **Match found →** comment on the existing issue with your context. **Stop. Do not create a new ticket.**
- **No match →** continue to Step 3.

**One ticket per blocker, ever — including across sessions.**

---

## Step 3 — Create exactly one ticket

Parse `$ARGUMENTS`: target team = first word, short description = the rest.

Label map:

| Target | Label |
|--------|-------|
| `frontend` | `needs: frontend` |
| `agent` | `needs: agent,api-contract` |
| `contracts` | `needs: contracts,api-contract` |
| `human` | `needs: human` |

**To another team:**
```bash
gh issue create \
  --title "[backend → TARGET] SHORT DESCRIPTION" \
  --label "LABEL" \
  --repo SankaiAI/outcomeX \
  --body "**From:** backend
**To:** TARGET
**Blocking:** WHAT YOU CANNOT BUILD

## Request

DETAILED REQUEST

## Definition of Done

WHAT THE RESPONSE MUST INCLUDE"
```

**For a human decision (spec conflict / PRD change):**
```bash
gh issue create \
  --title "[backend → human] SHORT DESCRIPTION" \
  --label "needs: human" \
  --repo SankaiAI/outcomeX \
  --body "**From:** backend
**Type:** spec-conflict OR prd-change-request
**Blocking:** WHAT YOU CANNOT BUILD

## What the current spec says

## What the problem is

## What I propose"
```

Print the created issue URL. Do not create a second ticket for the same need.

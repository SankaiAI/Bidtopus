---
description: Submit a ticket to another team. Use when you need something another component owns.
argument-hint: "[target-team] short description of what you need"
---

You are the **contracts** component submitting a ticket to another team.
`$ARGUMENTS` format: first word = target team (`backend` | `frontend` | `agent` | `human`), remainder = short description.

---

## Step 1 — Set up GitHub CLI auth

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep "^password" | cut -d= -f2)
export GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" auth status
```

If auth fails: **stop and tell the user** "gh auth failed — please run `gh auth login` manually and retry."

---

## Step 2 — MANDATORY: Search before creating

Extract 3–5 keywords from your description and search:
```bash
"$GH" issue list --repo SankaiAI/Bidtopus --state open --search "YOUR KEYWORDS"
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
| `backend` | `needs: backend,api-contract` |
| `frontend` | `needs: frontend` |
| `agent` | `needs: agent,api-contract` |
| `human` | `needs: human` |

**To another team:**
```bash
"$GH" issue create \
  --title "[contracts → TARGET] SHORT DESCRIPTION" \
  --label "LABEL" \
  --repo SankaiAI/Bidtopus \
  --body "**From:** contracts
**To:** TARGET
**Blocking:** WHAT YOU CANNOT BUILD

## Request

DETAILED REQUEST

## Definition of Done

WHAT THE RESPONSE MUST INCLUDE"
```

**For a human decision (spec conflict / PRD change):**
```bash
"$GH" issue create \
  --title "[contracts → human] SHORT DESCRIPTION" \
  --label "needs: human" \
  --repo SankaiAI/Bidtopus \
  --body "**From:** contracts
**Type:** spec-conflict OR prd-change-request
**Blocking:** WHAT YOU CANNOT BUILD

## What the current spec says

## What the problem is

## What I propose"
```

Print the created issue URL. Do not create a second ticket for the same need.

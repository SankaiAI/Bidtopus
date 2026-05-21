---
description: Submit a ticket to a component team as the project manager. Pass target team and description.
argument-hint: "[frontend|backend|agent|contracts|human] short description"
---

You are the **project manager (human/Shawn)** submitting a ticket to a component team.
`$ARGUMENTS` format: first word = target team, remainder = short description.

---

## Step 1 — Set up GitHub CLI auth

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep "^password" | cut -d= -f2)
GH="/c/Program Files/GitHub CLI/gh.exe"
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

## Step 3 — Write body to a temp file

Always use `--body-file` to avoid shell quoting/escaping issues with multiline bodies:

```bash
BODY_FILE=$(mktemp /tmp/ticket_body_XXXXXX.md)
cat > "$BODY_FILE" << 'BODYEOF'
**From:** human
**To:** TARGET
**Blocking:** WHAT IS BLOCKED

## Request

DETAILED REQUEST

## Definition of Done

CLEAR ACCEPTANCE CRITERIA
BODYEOF
```

Label map:

| Target | Label |
|--------|-------|
| `frontend` | `needs: frontend` |
| `backend` | `needs: backend` |
| `agent` | `needs: agent` |
| `contracts` | `needs: contracts` |
| `human` | `needs: human` |

---

## Step 4 — Create exactly one ticket

```bash
"$GH" issue create \
  --title "[human → TARGET] SHORT DESCRIPTION" \
  --label "LABEL" \
  --repo SankaiAI/Bidtopus \
  --body-file "$BODY_FILE"

rm "$BODY_FILE"
```

Print the created issue URL. Do not create a second ticket for the same need.

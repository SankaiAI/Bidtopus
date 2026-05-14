---
description: Claim and resolve a ticket assigned to the agent component. Pass the issue number, or omit to list open agent tickets.
argument-hint: "[issue-number]"
---

You are the **agent** component claiming and resolving an assigned ticket.
`$ARGUMENTS` = issue number to resolve (optional — if blank, list open `needs: agent` tickets first).

---

## Step 1 — Set up GitHub CLI auth

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep "^password" | cut -d= -f2)
export GH="/c/Program Files/GitHub CLI/gh.exe"
"$GH" auth status
```

If auth fails: **stop and tell the user** "gh auth failed — please run `gh auth login` manually and retry."

---

## Step 2 — Read the ticket

If an issue number was passed:
```bash
"$GH" issue view $ARGUMENTS --repo SankaiAI/outcomeX
```

If no number given, list open agent tickets first then ask which to work on:
```bash
"$GH" issue list --label "needs: agent" --state open --repo SankaiAI/outcomeX
```

Read the **full** issue body. Note the **Request** and **Definition of Done** sections.

---

## Step 3 — Verify ownership

Before claiming, confirm the work lives inside `agent/`. Ask:
- Does this change touch files I own?
- Is the capability mine to build, not another component's?

**If yes — it's mine:** continue to Step 4.

**If no — mislabeled:** redirect and stop:
```bash
"$GH" issue comment NUMBER --body "This belongs to CORRECT_TEAM. Redirecting." --repo SankaiAI/outcomeX
"$GH" issue edit NUMBER --remove-label "needs: agent" --add-label "needs: CORRECT_TEAM" --repo SankaiAI/outcomeX
```

---

## Step 4 — Claim and move to In Progress

```bash
"$GH" issue comment NUMBER --body "Confirmed this is mine. Picking it up now." --repo SankaiAI/outcomeX
"$GH" issue edit NUMBER --add-label "status: in-progress" --repo SankaiAI/outcomeX
```

The label triggers the GitHub Projects automation rule that moves the card to the In Progress column.

---

## Step 5 — Do the work

Complete everything described in the **Request** section. When finished, continue to Step 6.

---

## Step 6 — Close and mark Done

```bash
"$GH" issue comment NUMBER --body "Done. SUMMARY OF WHAT WAS BUILT" --repo SankaiAI/outcomeX
"$GH" issue close NUMBER --repo SankaiAI/outcomeX
```

Closing the issue triggers the GitHub Projects automation rule that moves the card to the Done column.

Reference the issue in your commit: `git commit -m "fix: description (Closes #NUMBER)"`

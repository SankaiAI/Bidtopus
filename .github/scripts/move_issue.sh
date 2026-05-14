#!/bin/bash
# Usage: bash .github/scripts/move_issue.sh <issue-number> <"In Progress"|"Done">
# Moves a GitHub issue to the specified column on the OutcomeX project board.
# Requires GH_TOKEN with project scope (PROJECT_TOKEN).

ISSUE_NUMBER=$1
STATUS=$2
OWNER="SankaiAI"
REPO="outcomeX"
PROJECT_NUMBER=2

if [ -z "$ISSUE_NUMBER" ] || [ -z "$STATUS" ]; then
  echo "Usage: bash .github/scripts/move_issue.sh <issue-number> <'In Progress'|'Done'>"
  exit 1
fi

# Get project ID
PROJECT_ID=$(gh api graphql -f query="query { user(login: \"$OWNER\") { projectV2(number: $PROJECT_NUMBER) { id } } }" --jq '.data.user.projectV2.id')

# Get issue node ID
ISSUE_NODE_ID=$(gh api repos/$OWNER/$REPO/issues/$ISSUE_NUMBER --jq '.node_id')

# Add issue to project (idempotent — safe to call even if already added)
ITEM_ID=$(gh api graphql -f query="mutation { addProjectV2ItemById(input: { projectId: \"$PROJECT_ID\" contentId: \"$ISSUE_NODE_ID\" }) { item { id } } }" --jq '.data.addProjectV2ItemById.item.id')

# Get Status field ID and the target option ID
FIELD_DATA=$(gh api graphql -f query="query { node(id: \"$PROJECT_ID\") { ... on ProjectV2 { fields(first: 20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }" --jq ".data.node.fields.nodes[] | select(.name == \"Status\")")

FIELD_ID=$(echo $FIELD_DATA | jq -r '.id')
OPTION_ID=$(echo $FIELD_DATA | jq -r ".options[] | select(.name == \"$STATUS\") | .id")

if [ -z "$OPTION_ID" ]; then
  echo "Error: status '$STATUS' not found on project board. Valid values: In Progress, Done"
  exit 1
fi

# Move the item
gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \"$PROJECT_ID\" itemId: \"$ITEM_ID\" fieldId: \"$FIELD_ID\" value: { singleSelectOptionId: \"$OPTION_ID\" } }) { projectV2Item { id } } }" > /dev/null

echo "Issue #$ISSUE_NUMBER moved to '$STATUS'"

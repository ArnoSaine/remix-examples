#!/bin/bash

set -e

template_branch="my-remix-app/default"

if git show-ref --verify --quiet "refs/heads/$template_branch"; then
    git switch "$template_branch"
    git rm -rf .
    git clean -fdx
else
    git switch --orphan "$template_branch"
fi

npx remix@next new . --app-name "My Remix App" --force

git add -A

if ! git diff --cached --quiet; then
    git commit -m "Initialize My Remix App" --amend
else
    echo "No changes to commit for My Remix App"
fi

git switch main
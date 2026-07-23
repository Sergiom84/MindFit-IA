#!/bin/bash

# 🚀 Git Aliases Setup for Better Workflow
# Run this script once to set up useful git aliases

echo "🛠️ Setting up Git aliases for improved workflow..."

# Logging and status
git config --global alias.lg "log --oneline --graph --decorate --all -20"
git config --global alias.s "status -sb"
git config --global alias.unstage "reset HEAD --"

# Branch management
git config --global alias.co "checkout"
git config --global alias.br "branch"
git config --global alias.sw "switch"
git config --global alias.swc "switch -c"

# Commit and add shortcuts  
git config --global alias.ci "commit"
git config --global alias.cm "commit -m"
git config --global alias.ca "commit -am"
git config --global alias.amend "commit --amend --no-edit"

# Diff shortcuts
git config --global alias.df "diff"
git config --global alias.dfc "diff --cached"
git config --global alias.dfm "diff origin/main...HEAD"

# Rebase helpers
git config --global alias.rb "rebase"
git config --global alias.rbc "rebase --continue"
git config --global alias.rba "rebase --abort"
git config --global alias.rbi "rebase -i"

# Stash helpers
git config --global alias.st "stash"
git config --global alias.stp "stash pop"
git config --global alias.stl "stash list"

# Remote operations
git config --global alias.pu "push -u origin"
git config --global alias.pf "push --force-with-lease"
git config --global alias.pl "pull"

# Useful complex aliases
git config --global alias.sync "!git fetch origin && git rebase origin/main"
git config --global alias.update-main "!git switch main && git pull origin main"
git config --global alias.new-branch "!f() { git switch main && git pull && git switch -c \$1; }; f"

# Find and cleanup
git config --global alias.find-commit "!f() { git log --grep=\$1 --oneline; }; f"
git config --global alias.cleanup "!git branch --merged main | grep -v 'main' | xargs -n 1 git branch -d"

# Conflict resolution helpers
git config --global alias.conflicts "diff --name-only --diff-filter=U"
git config --global alias.resolve "add -A"

# Pretty log formats
git config --global alias.hist "log --pretty=format:'%Cred%h%Creset %ad | %Cgreen%s%Creset %Cblue[%an]%Creset' --graph --date=short"
git config --global alias.today "log --since='1 day ago' --oneline --author=\$(git config user.name)"

echo "✅ Git aliases configured successfully!"
echo ""
echo "📝 Available aliases:"
echo "Basic commands:"
echo "  git s        → git status -sb"  
echo "  git co       → git checkout"
echo "  git sw       → git switch"
echo "  git swc      → git switch -c"
echo "  git cm       → git commit -m"
echo "  git ca       → git commit -am" 
echo ""
echo "Advanced commands:"
echo "  git lg       → Pretty log with graph"
echo "  git dfm      → Diff with main branch"
echo "  git sync     → Fetch and rebase with main"
echo "  git new-branch <name> → Create branch from updated main"
echo "  git cleanup  → Delete merged branches"
echo "  git today    → Show today's commits"
echo ""
echo "🎯 Try: git lg  or  git s"
#!/bin/bash

# 🚀 Git Workflow Helper Scripts
# Automatiza las mejores prácticas de Git para evitar pérdida de código

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

# Function: Update main branch
update_main() {
    print_info "Updating main branch..."
    
    # Stash any uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        print_warning "Stashing uncommitted changes..."
        git stash push -m "Auto-stash before updating main"
        STASHED=true
    fi
    
    # Switch to main and pull latest
    git switch main
    git pull origin main
    
    print_success "Main branch updated"
    
    # Restore stash if we stashed something
    if [[ ${STASHED:-false} == true ]]; then
        print_info "Restoring stashed changes..."
        git stash pop
    fi
}

# Function: Create new feature branch
create_branch() {
    if [[ -z "$1" ]]; then
        print_error "Usage: create_branch <branch-name>"
        print_info "Example: create_branch feat/improve-calisthenics"
        exit 1
    fi
    
    local branch_name="$1"
    
    print_info "Creating new branch: $branch_name"
    
    # Ensure we're on updated main
    update_main
    
    # Create and switch to new branch
    git switch -c "$branch_name"
    
    print_success "Branch '$branch_name' created and checked out"
}

# Function: Daily sync (rebase with main)
daily_sync() {
    local current_branch=$(git branch --show-current)
    
    if [[ "$current_branch" == "main" ]]; then
        print_warning "You're on main branch. Use 'update_main' instead."
        return 1
    fi
    
    print_info "Daily sync for branch: $current_branch"
    
    # Fetch latest changes
    git fetch origin
    
    # Check if main has new commits
    local behind_count=$(git rev-list --count HEAD..origin/main)
    if [[ $behind_count -eq 0 ]]; then
        print_success "Branch is up to date with main"
        return 0
    fi
    
    print_info "Main has $behind_count new commits. Rebasing..."
    
    # Rebase current branch with main
    git rebase origin/main
    
    print_success "Daily sync completed"
}

# Function: Pre-merge checklist
pre_merge_check() {
    local current_branch=$(git branch --show-current)
    
    if [[ "$current_branch" == "main" ]]; then
        print_error "You're on main branch. Switch to feature branch first."
        return 1
    fi
    
    print_info "Running pre-merge checklist for: $current_branch"
    
    # 1. Check if branch is synced with main
    git fetch origin
    local behind_count=$(git rev-list --count HEAD..origin/main)
    if [[ $behind_count -gt 0 ]]; then
        print_warning "Branch is $behind_count commits behind main. Run daily_sync first."
    else
        print_success "Branch is up to date with main"
    fi
    
    # 2. Show diff with main
    print_info "Showing changes since main..."
    git diff --stat origin/main...HEAD
    
    # 3. Run linting and tests
    print_info "Running linting and tests..."
    npm run lint || print_warning "Linting issues found"
    npm run test || print_warning "Test issues found"
    
    # 4. Try build
    print_info "Testing build..."
    npm run build || print_warning "Build issues found"
    
    print_success "Pre-merge checklist completed"
    print_info "If all checks passed, you're ready to create a PR or merge!"
}

# Function: Emergency stash and switch
emergency_switch() {
    if [[ -z "$1" ]]; then
        print_error "Usage: emergency_switch <branch-name>"
        exit 1
    fi
    
    local target_branch="$1"
    local current_branch=$(git branch --show-current)
    
    print_warning "Emergency switch from $current_branch to $target_branch"
    
    # Stash everything including untracked files
    git stash push -u -m "Emergency stash from $current_branch at $(date)"
    
    # Switch to target branch
    git switch "$target_branch"
    
    print_success "Switched to $target_branch. Your work is stashed!"
    print_info "To restore later: git switch $current_branch && git stash pop"
}

# Function: Find lost commits
find_lost_commits() {
    print_info "Searching for lost commits in reflog..."
    git reflog --all --oneline | head -20
    
    print_info "If you see your lost commit, use:"
    print_info "git cherry-pick <commit-hash>"
    print_info "or"  
    print_info "git reset --hard <commit-hash>"
}

# Function: Show help
show_help() {
    echo "🚀 Git Workflow Helper"
    echo ""
    echo "Commands:"
    echo "  update_main              - Update main branch safely"
    echo "  create_branch <name>     - Create new feature branch from main"
    echo "  daily_sync              - Rebase current branch with main"  
    echo "  pre_merge_check         - Run pre-merge checklist"
    echo "  emergency_switch <name> - Emergency switch branches with stash"
    echo "  find_lost_commits       - Find lost commits in reflog"
    echo ""
    echo "Examples:"
    echo "  ./git-workflow.sh create_branch feat/new-feature"
    echo "  ./git-workflow.sh daily_sync"
    echo "  ./git-workflow.sh pre_merge_check"
}

# Main script logic
case "${1:-help}" in
    "update_main"|"update-main")
        update_main
        ;;
    "create_branch"|"create-branch")
        create_branch "$2"
        ;;
    "daily_sync"|"daily-sync"|"sync")
        daily_sync
        ;;
    "pre_merge_check"|"pre-merge-check"|"check")
        pre_merge_check
        ;;
    "emergency_switch"|"emergency-switch"|"emergency")
        emergency_switch "$2"
        ;;
    "find_lost_commits"|"find-lost-commits"|"find")
        find_lost_commits
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
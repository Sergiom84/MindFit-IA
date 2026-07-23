#!/bin/bash

# 🚀 Release Automation Script
# Creates tags and releases following semantic versioning

set -e

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

# Function: Create release
create_release() {
    if [[ -z "$1" ]]; then
        print_error "Usage: create_release <version>"
        print_info "Examples:"
        print_info "  ./release.sh create_release v1.3.0"
        print_info "  ./release.sh create_release v2.0.0-beta.1"
        exit 1
    fi
    
    local version="$1"
    local current_branch=$(git branch --show-current)
    
    # Ensure we're on main branch
    if [[ "$current_branch" != "main" ]]; then
        print_error "Must be on main branch to create release. Currently on: $current_branch"
        exit 1
    fi
    
    print_info "Creating release: $version"
    
    # Ensure main is up to date
    print_info "Updating main branch..."
    git pull origin main
    
    # Run final checks
    print_info "Running pre-release checks..."
    npm run lint || { print_error "Lint checks failed"; exit 1; }
    npm run build || { print_error "Build failed"; exit 1; }
    npm run test || { print_error "Tests failed"; exit 1; }
    
    # Create tag with message
    print_info "Creating git tag: $version"
    git tag "$version" -m "Release $version"
    
    # Push tag to remote
    print_info "Pushing tag to remote..."
    git push origin "$version"
    
    print_success "Release $version created and pushed!"
    print_info "Tag created: $version"
    print_info "View releases: https://github.com/your-org/entrena-con-ia/releases"
}

# Function: List releases
list_releases() {
    print_info "Recent releases:"
    git tag --sort=-version:refname | head -10
}

# Function: Delete release
delete_release() {
    if [[ -z "$1" ]]; then
        print_error "Usage: delete_release <version>"
        exit 1
    fi
    
    local version="$1"
    
    print_warning "Deleting release: $version"
    
    # Delete local tag
    git tag -d "$version" 2>/dev/null || echo "Local tag not found"
    
    # Delete remote tag
    git push origin --delete "$version" 2>/dev/null || echo "Remote tag not found"
    
    print_success "Release $version deleted"
}

# Function: Show current version
current_version() {
    local latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "No tags found")
    print_info "Latest release: $latest_tag"
    
    # Show commits since last tag
    if [[ "$latest_tag" != "No tags found" ]]; then
        local commit_count=$(git rev-list --count "$latest_tag"..HEAD)
        print_info "Commits since last release: $commit_count"
        
        if [[ $commit_count -gt 0 ]]; then
            print_info "Recent commits:"
            git log --oneline "$latest_tag"..HEAD | head -5
        fi
    fi
}

# Function: Rollback to previous version
rollback() {
    if [[ -z "$1" ]]; then
        print_error "Usage: rollback <version>"
        print_info "Example: ./release.sh rollback v1.2.0"
        exit 1
    fi
    
    local version="$1"
    
    print_warning "Rolling back to: $version"
    
    # Verify tag exists
    if ! git rev-parse "$version" >/dev/null 2>&1; then
        print_error "Tag $version does not exist"
        exit 1
    fi
    
    # Create rollback branch
    local rollback_branch="rollback-to-$version"
    git checkout -b "$rollback_branch"
    
    # Revert to tag state
    git revert --no-commit "$(git rev-list --max-count=1 HEAD)"
    git commit -m "Rollback to $version"
    
    print_success "Rollback branch created: $rollback_branch"
    print_info "Review changes and create PR to merge rollback"
}

# Function: Show help
show_help() {
    echo "🚀 Release Management Helper"
    echo ""
    echo "Commands:"
    echo "  create_release <version>  - Create and push new release tag"
    echo "  list_releases            - Show recent releases"
    echo "  current_version          - Show current version and unreleased commits"
    echo "  delete_release <version> - Delete a release tag"
    echo "  rollback <version>       - Create rollback branch to previous version"
    echo ""
    echo "Examples:"
    echo "  ./release.sh create_release v1.3.0"
    echo "  ./release.sh list_releases"
    echo "  ./release.sh current_version"
    echo "  ./release.sh rollback v1.2.0"
}

# Main script logic
case "${1:-help}" in
    "create_release"|"create-release"|"release")
        create_release "$2"
        ;;
    "list_releases"|"list-releases"|"list")
        list_releases
        ;;
    "current_version"|"current-version"|"version")
        current_version
        ;;
    "delete_release"|"delete-release"|"delete")
        delete_release "$2"
        ;;
    "rollback")
        rollback "$2"
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
#!/bin/bash

# Setup git configuration for the development environment
echo "Setting up git configuration..."

# Set global git configurations that are commonly needed
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global core.autocrlf input
git config --global core.editor "code --wait"

# Set safe directory to avoid git warnings
git config --global --add safe.directory /workspace

# Configure git to use credential helper
git config --global credential.helper store

echo "Git configuration completed!"

# Display current git configuration
echo "Current git configuration:"
git config --global --list

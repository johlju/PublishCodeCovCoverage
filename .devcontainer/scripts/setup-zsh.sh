#!/bin/bash

# Setup zsh with useful plugins and aliases for development
echo "Setting up zsh configuration..."

# Create .zshrc with useful aliases and configurations
cat > ~/.zshrc << 'EOF'
# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load
ZSH_THEME="robbyrussell"

# Plugins to load
plugins=(
  git
  node
  npm
  yarn
  vscode
  colored-man-pages
  colorize
  command-not-found
  zsh-autosuggestions
  zsh-syntax-highlighting
)

source $ZSH/oh-my-zsh.sh

# User configuration
export PATH=$HOME/bin:/usr/local/bin:$PATH
export NODE_ENV=development
export NEXT_TELEMETRY_DISABLED=1

# Aliases for development
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# Git aliases
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gd='git diff'
alias gb='git branch'
alias gco='git checkout'
alias glog='git log --oneline --graph --decorate'

# npm/yarn aliases
alias ni='npm install'
alias ns='npm start'
alias nd='npm run dev'
alias nb='npm run build'
alias nt='npm test'
alias nl='npm run lint'
alias nf='npm run format'

# Next.js specific aliases
alias dev='npm run dev'
alias build='npm run build'
alias start='npm run start'
alias lint='npm run lint'
alias format='npm run format'
alias typecheck='npm run type-check'
alias check='npm run check'

# Docker aliases
alias dps='docker ps'
alias dpa='docker ps -a'
alias di='docker images'
alias drmi='docker rmi'
alias drmf='docker rm -f'

# VS Code aliases
alias code='code --reuse-window'
alias c='code .'

# Utility functions
mkcd() {
    mkdir -p "$1" && cd "$1"
}

# Show current Node.js and npm versions
node --version
npm --version

EOF

echo "Zsh configuration completed!"
echo "Aliases and functions have been set up for development workflow."

# Use the official Node.js 22 LTS image as base
FROM node:22-bullseye

# Install system dependencies and tools in a single layer
RUN apt-get update && \
    apt-get install -y \
        git \
        curl \
        wget \
        unzip \
        ca-certificates \
        gnupg \
        lsb-release \
        software-properties-common \
        build-essential \
        python3 \
        python3-pip \
        zsh \
        sudo && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user, use a UID and GID that does not exist on the host
ARG USERNAME=vscode
ARG USER_UID=1002
ARG USER_GID=$USER_UID

# Create user, group, and configure sudo in a single layer
RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --uid $USER_UID --gid $USER_GID -m $USERNAME && \
    echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME && \
    chmod 0440 /etc/sudoers.d/$USERNAME

# Set zsh as default shell and install global npm packages
USER root
RUN chsh -s /bin/zsh $USERNAME && \
    npm install -g \
        npm@latest

# Set the working directory and configure workspace
WORKDIR /workspace

# Ensure vscode user owns the workspace
RUN chown -R $USERNAME:$USERNAME /workspace

# Switch to vscode user for final setup
USER $USERNAME

# Install Oh My Zsh and configure git in final user context
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended && \
    git config --global --add safe.directory /workspace

# Set default shell to zsh
ENV SHELL=/bin/zsh
ENV NODE_ENV=development
ENV CI=false

# Expose the ports
#EXPOSE 3000 3001

# Keep container running
CMD ["sleep", "infinity"]

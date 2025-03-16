FROM node:23-alpine

# Add labels to image
LABEL maintainer="Discord Bot Maintainer"
LABEL description="Discord Reaction Roles Bot with Web Dashboard"
LABEL version="1.0.5"

# Use NODE_ENV argument with overridable default
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install build tools (for native modules) and dependencies
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --only=production \
    && apk del .build-deps

# Copy app code
COPY . .

# Create logs directory with appropriate permissions
RUN mkdir -p logs && chmod -R 777 logs

# Switch to non-root user with appropriate permissions
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# Set entry point
CMD ["node", "index.js"]
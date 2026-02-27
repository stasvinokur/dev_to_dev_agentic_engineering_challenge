FROM oven/bun:1-slim
WORKDIR /app

# Install dependencies
COPY sonar-gatekeeper-mcp/package.json sonar-gatekeeper-mcp/bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source code
COPY sonar-gatekeeper-mcp/src/ src/

# Copy demo project
COPY demo_project/ /demo_project/

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve"]

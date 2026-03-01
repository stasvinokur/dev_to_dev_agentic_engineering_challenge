FROM oven/bun:1 AS base
WORKDIR /app

COPY sonar-gatekeeper-mcp/package.json sonar-gatekeeper-mcp/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY sonar-gatekeeper-mcp/src/ src/
COPY sonar-gatekeeper-mcp/entrypoint.sh ./
RUN chmod +x entrypoint.sh

COPY demo_project/ /demo_project/

ENTRYPOINT ["./entrypoint.sh"]
CMD ["serve"]

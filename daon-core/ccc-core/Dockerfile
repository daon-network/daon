# Creative Commons Chain (CCC) - Docker Image for Production Deployment
# This image will be published to Docker Hub for easy validator deployment

# Multi-stage build for optimized production image
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git make gcc musl-dev

# Set working directory
WORKDIR /src

# Copy go module files first (for better caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the blockchain binary
RUN make build

# Production image
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates curl jq

# Create non-root user for security
RUN adduser -D -s /bin/sh ccc

# Set working directory
WORKDIR /home/ccc

# Copy binary from builder stage
COPY --from=builder /src/build/ccc-cored /usr/local/bin/

# Copy configuration templates
COPY --from=builder /src/config.yml /home/ccc/config.yml.template

# Set proper permissions
RUN chown -R ccc:ccc /home/ccc

# Switch to non-root user
USER ccc

# Expose ports
EXPOSE 26656 26657 1317 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:26657/health || exit 1

# Default command
CMD ["ccc-cored", "start", "--home", "/home/ccc/.ccc-core"]
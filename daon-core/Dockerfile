# DAON Blockchain Node - Docker Image for Production Deployment
# Multi-stage build for optimized production image

FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Set working directory
WORKDIR /src

# Copy go module files first (for better caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the blockchain binary
# CGO_ENABLED=0 for static binary (no C dependencies)
# -ldflags="-w -s" strips debug info for smaller binary
ENV CGO_ENABLED=0
RUN mkdir -p /src/build && \
    go build -ldflags="-w -s" -trimpath -o /src/build/daond ./cmd/daon-cored

# Production image
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates curl jq

# Create non-root user for security
RUN adduser -D -s /bin/sh daon

# Set working directory
WORKDIR /daon

# Copy binary from builder stage
COPY --from=builder /src/build/daond /usr/local/bin/

# Create data directory
RUN mkdir -p /daon/.daon && chown -R daon:daon /daon

# Switch to non-root user
USER daon

# Expose ports
EXPOSE 26656 26657 1317 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:26657/status || exit 1

# Default command
CMD ["daond", "start", "--home", "/daon/.daon"]
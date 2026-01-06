# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates gcc musl-dev

# Copy go mod files first (for caching)
COPY go.mod ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary with CGO enabled (required for SQLite)
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /api \
    main.go

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN adduser -D -u 1000 sentinel

# Create data directory
RUN mkdir -p /data && chown sentinel:sentinel /data

# Copy binary from builder
COPY --from=builder /api /usr/local/bin/api

# Set ownership
RUN chown sentinel:sentinel /usr/local/bin/api

# Use non-root user
USER sentinel

# Default environment
ENV API_PORT="8080" \
    DB_PATH="/data/sentinel.db" \
    EVENT_RETENTION_HOURS="24" \
    LOG_LEVEL="info"

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/usr/local/bin/api"]

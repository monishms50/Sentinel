# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files first (for caching)
COPY go.mod ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /agent \
    main.go

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
# - ca-certificates: for HTTPS
# - kubectl: for exec fallback (optional)
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN adduser -D -u 1000 sentinel

# Copy binary from builder
COPY --from=builder /agent /usr/local/bin/agent

# Set ownership
RUN chown sentinel:sentinel /usr/local/bin/agent

# Use non-root user
USER sentinel

# Default environment
ENV NODE_NAME="" \
    API_ENDPOINT="http://sentinel-api:8080" \
    SCAN_INTERVAL="30" \
    MONITORED_NAMESPACES="demo-app" \
    LOG_LEVEL="info"

ENTRYPOINT ["/usr/local/bin/agent"]

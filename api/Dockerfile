# ----------------------------
# Builder Stage  
# ----------------------------
FROM golang:1.22-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
 && rm -rf /var/lib/lists/*

# Copy go modules and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary for the CURRENT architecture (no cross-compile)
RUN CGO_ENABLED=0 go build \
    -ldflags="-w -s" \
    -o /api \
    main.go

# Verify the binary matches host architecture
RUN file /api

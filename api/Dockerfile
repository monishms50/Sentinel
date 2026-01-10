# ---------- BUILD STAGE ----------
FROM --platform=linux/amd64 golang:1.22-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /app/sentinel-api main.go

# ---------- RUNTIME STAGE ----------
FROM --platform=linux/amd64 debian:12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1000 --create-home sentinel

RUN mkdir -p /data && chown sentinel:sentinel /data

WORKDIR /usr/local/bin

COPY --from=builder /app/sentinel-api ./sentinel-api

RUN chmod +x sentinel-api && chown sentinel:sentinel sentinel-api

USER sentinel

EXPOSE 8080

ENTRYPOINT ["./sentinel-api"]

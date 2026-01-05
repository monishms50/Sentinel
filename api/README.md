Central API server that aggregates data, serves UI, and exposes control endpoints.

Dockerfile — Builds the API container

main.go / index.ts — API server entry point

handlers/ — HTTP request handlers

models/ — Data models and schemas

store/ — Persistence layer (SQLite / Redis)

websocket/ — Real-time updates to the UI
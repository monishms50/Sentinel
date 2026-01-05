Core agent logic broken into functional modules.

baseline/ — Captures filesystem and runtime snapshots

monitor/ — Detects drift from established baselines

scoring/ — Calculates entropy and risk scores

reporter/ — Sends findings to the Sentinel API
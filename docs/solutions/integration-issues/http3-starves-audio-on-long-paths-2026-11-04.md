---
title: HTTP/3 starved the player on a long lossy path
date: 2026-11-04
category: integration-issues
module: deployment
problem_type: integration_issue
component: caddy
severity: high
symptoms:
  - The page loads, the player says it is playing, and no sound comes out
  - The audio element sits at readyState 0 with networkState 2, then fires stalled
  - dead-internet-radio.com stays silent across reloads while the sslip.io hostname plays
  - Caddy logs media requests that end at 20-50 KB with H3_REQUEST_CANCELLED
tags: [caddy, http3, quic, alt-svc, audio, apps1]
---

# HTTP/3 starved the player on a long lossy path

The server was never the bottleneck: during a stall it was 98% idle and a
request through Caddy on loopback took 30 ms. Files, ranges and the page were
all correct.

## What happened

Caddy advertises HTTP/3 by default, so returning Chrome visitors reach apps1
over QUIC. From the captain's Mac the path is 245 ms long and drops packets in
bursts. The kernel uses BBR for TCP, which holds its rate through loss. QUIC
does its own congestion control in user space, so BBR never applies to it.

| Measurement from the Mac | HTTP/3 | HTTP/2 |
|---|---|---|
| 2.4 MB track, idle page | 206-214 KB/s | 1100-2357 KB/s |
| Same host during a stall | about 3 KB/s | 54 KB/s or better |

128 kbps audio needs 16 KB/s, so a QUIC session in that state cannot start.

## Why only one hostname looked broken

Chrome keeps one QUIC session per origin and every tab shares it. During a
stall a new tab on the .com stalled too, while fresh TCP connections to www and
sslip.io played in 2-4 s from the same browser, against the same server. Each
hostname has its own session, so one going bad reads as a hostname fault. Look
for a transport cause before comparing Rails config between hostnames.

## Fix

The Dead Internet Radio site block in `caddy/Caddyfile` (servers repo) sends:

```
header Alt-Svc clear
```

Removing the header is not enough. Browsers cache `h3` for 30 days, and `clear`
wipes that entry on the first response. The Caddyfile keeps this scoped to one
site; `servers { protocols h1 h2 }` would turn HTTP/3 off for every app on :443.

## Limits of the evidence

The stall comes and goes with the path. In 14 alternating full-page loads on a
less loaded Mac neither protocol stuck, though one forced-HTTP/3 load failed and
another took over 8 s to start. HTTP/2 also dipped once during a bad spell. The
throughput gap and the stuck-session test are the evidence, and a repeat from
this path is the thing to check if it returns.

## Testing it

A fresh headless profile starts on HTTP/2 and hides this. To test the returning
listener:

1. Load the site in a persistent profile (`CHROME_DEVTOOLS_AXI_USER_DATA_DIR`).
2. Read `Default/Network Persistent State` and find the `quic` entry for the host.
3. Force a protocol with `--origin-to-force-quic-on=<host>:443` or `--disable-quic`.
4. Read `nextHopProtocol` from `performance.getEntriesByType('resource')`.

Puppeteer-style `eval` grants user activation, so it cannot test the autoplay
gate. Caddy `duration` on media requests is paced by playback, so it is not
throughput.

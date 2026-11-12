---
title: A cool guard freeze looked like a dead ACE-Step
date: 2026-11-05
category: integration-issues
module: generation_pipeline
problem_type: integration_issue
component: ace_step
severity: high
tags: [ace-step, generation-pc, timeouts, cool-guard]
---

# A cool guard freeze looked like a dead ACE-Step

A 12-track show died on track 2 with a bare `TimeoutError: timed out` from
`query_ace_step`.

**Cause.** The generation PC's cool guard (`dir-pc-coolguard.sh`, in the servers
repo) sends ACE-Step SIGSTOP at 76 °C and SIGCONT at 62 °C. The kernel still
accepts connections to a frozen server, so a poll connects and then gets no reply
until its 10 s read timeout. That timeout surfaces as `TimeoutError` from
`getresponse()`, which urllib does not wrap in `URLError`.

The server was not slow: no run on the PC had ever missed a poll before this first
freeze, so the 10 s timeout stayed.

**Fix.** `query_ace_step` treats `OSError` and `http.client.HTTPException` as a
missed poll. `call_ace_step` waits 600 s: retrying a timed-out submission could
render the song twice, because the request is still in the socket when ACE-Step
wakes.

**Limits.** A freeze counts against `poll_ace_step`'s 900 s per track, and after 24
missed polls (about 10 minutes) a failed health check ends the show.

**Second cause: a freeze could never end.** The guard's `cpu` reading is the hottest of
every `/sys/class/thermal` zone, and on this laptop that is `iwlwifi_1`, the WiFi
card, not the CPU. On a 12-track rerun it sat at 64-65 °C with ACE-Step frozen while
`x86_pkg_temp` idled near 57 °C and the GPU reached 60 °C, so the 62 °C wake point
was out of reach. Freezes took 8, 5 and 8 minutes, and the fourth never woke: after
12 minutes frozen the 24-miss limit ended the show on track 7. `dir-pc-coolguard.sh`
in the servers repo was changed to read `x86_pkg_temp` and the GPU only; freezes
then lasted about 2.5 minutes. A later freeze that did not thaw is documented in
[the subsequent incident](stale-free-models-and-endless-cool-freeze-2026-11-12.md).

**Testing it.** SIGSTOP a stub server and poll it: a mock raising `URLError` would
have passed against the old code.

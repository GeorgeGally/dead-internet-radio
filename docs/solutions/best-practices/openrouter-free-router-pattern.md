---
title: Use openrouter/free as the single model target, not a list of specific free models
date: 2026-06-16
category: docs/solutions/best-practices
module: dead-internet-radio
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Writing a new script that calls OpenRouter for LLM completions
  - Adding model selection logic to existing generation pipelines
  - Seeing rate limit (429) or model rejection (400) errors with free models
  - Any code that iterates through a hardcoded list of free model names
tags:
  - openrouter
  - llm
  - model-selection
  - rate-limiting
  - free-tier
---

# Use `openrouter/free` as the single model target, not a list of specific free models

## Context

OpenRouter provides a smart router model ID `openrouter/free` (released Feb 2026) that automatically selects the best available free model for each request. Instead of hardcoding a list of specific free models and cycling through them, send all requests to `openrouter/free` and let OpenRouter handle fallback, capacity, and routing.

The old approach caused:
- Rate limited (429) on popular free models (Gemma 4 series)
- `json_object` rejections (400) from models that don't support `response_format`
- Wasted retries cycling through models that were unavailable
- Slow pipeline with 3-6s waits per model per attempt

## Guidance

**Always use `openrouter/free` as the default model.**

```python
OPENROUTER_MODEL = "openrouter/free"
```

Support overrides via environment variable for testing:
```python
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")
```

**Never use `response_format` / `json_mode`.** The free router mixes models with different capabilities — many don't support `json_object`. Instead, request plain text output and parse JSON using `extract_json()` / `extract_json_array()` post-processing functions.

```python
# Bad — json_object rejected by many free models:
body["response_format"] = {"type": "json_object"}

# Good — request plain text, parse after:
raw = call_llm(system_prompt, user_message)
data = extract_json(raw)  # or extract_json_array(raw)
```

**Keep the LLM call simple** — one model, no cycling, just retry on transient errors:

```python
def call_llm(system_prompt, user_message):
    for attempt in range(3):
        body = {"model": OPENROUTER_MODEL, ...}
        try:
            req = urllib.request.Request(OPENROUTER_URL, ...)
            with urllib.request.urlopen(req, timeout=120) as resp:
                ...
                return content
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            ...
    sys.exit(1)
```

## Why This Matters

OpenRouter's free model catalog changes frequently — models appear, disappear, get rate limited, and change providers. The `openrouter/free` router abstracts all this volatility. Hardcoding specific model names means:
- You maintain a fragile list that breaks when models change status
- You burn API quota on retries to unavailable models
- You miss new free models that OpenRouter adds to the pool
- You get slower pipelines due to cycling through dead models

## When to Apply

- Any time you write code that calls an LLM through OpenRouter
- When adding new generation scripts or tools
- When debugging rate limit or model rejection errors
- During code review of any OpenRouter integration

## Examples

**Before (build_site.py, generate.py):**
```python
OPENROUTER_FREE_MODELS = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-4-9b-it:free",
    "google/gemma-4-flash:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
]

def call_llm(system_prompt, user_message, json_mode=False):
    while len(tried) < len(OPENROUTER_FREE_MODELS):
        model = _next_model()
        ...
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            ...
        except HTTPError as e:
            if e.code == 400 and use_json_mode:
                # retry without json_mode — wasted round trip
            if e.code == 429:
                time.sleep(...)
                continue
```

**After:**
```python
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")

def call_llm(system_prompt, user_message):
    for attempt in range(3):
        body = {"model": OPENROUTER_MODEL, ...}
        try:
            ...
            return content
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(...)
                continue
```

## Related

- `docs/plans/` — pipeline architecture documents
- OpenRouter docs: https://openrouter.ai/docs/guides/overview/free-models (openrouter/free router)

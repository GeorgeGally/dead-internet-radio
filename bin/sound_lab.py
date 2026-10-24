#!/usr/bin/env python3
"""Render one caption under several ACE-Step settings with a fixed seed, so the
only difference between files is the setting being tested.

    python bin/sound_lab.py <out_dir> <prompt.json> <variant> [<variant> ...]

Variants: plain, think, tags, lora_postpunk, lora_electronic. ACE-Step must
already be running with whatever startup settings (dtype, LM) this batch tests.
"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ACE = "http://localhost:8001"
SEED = 4242
LORAS = Path(__file__).resolve().parent.parent / "ACE-Step-1.5" / "loras"


def post(path, body, timeout=120):
    req = urllib.request.Request(ACE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def render(body, out):
    task = post("/release_task", body)["data"]["task_id"]
    while True:
        time.sleep(5)
        data = post("/query_result", {"task_id_list": [task]}, timeout=30)["data"][0]
        if data["status"] == 1:
            break
        if data["status"] == 2:
            raise RuntimeError(f"task failed: {data}")
    url = json.loads(data["result"])[0]["file"]
    wav = out.with_suffix(".wav")
    urllib.request.urlretrieve(ACE + url, wav)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-b:a", "320k", str(out)], check=True)
    wav.unlink()


def main():
    out_dir, prompt_file, *variants = sys.argv[1:]
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    p = json.loads(Path(prompt_file).read_text())["payload"]
    base = {
        "prompt": p["caption"], "lyrics": p.get("lyrics", ""), "bpm": p.get("bpm"),
        "key_scale": p.get("keyscale", ""), "audio_duration": 120, "batch_size": 1,
        "audio_format": "wav", "thinking": False, "use_random_seed": False, "seed": SEED,
    }
    tags = p.get("lab_tags")
    for v in variants:
        body = dict(base)
        lora = None
        if v == "think":
            body.update(thinking=True, use_cot_caption=False)
        elif v == "think_rewrite":
            body.update(thinking=True, use_cot_caption=True)
        elif v == "tags" and tags:
            body["prompt"] = tags
        elif v.startswith("lora_"):
            name = v[5:]
            lora = LORAS / name
            trigger = {"postpunk": "roti-p0stpnk", "electronic": "roti-3l3ktr0n"}[name]
            body["prompt"] = f"{trigger}, {tags or p['caption']}"
            lora = LORAS / {"postpunk": "post_punk", "electronic": "electronic"}[name]
            post("/v1/lora/load", {"lora_path": str(lora)})
            post("/v1/lora/scale", {"scale": 1.0})
        t0 = time.time()
        render(body, out_dir / f"{v}.mp3")
        if lora:
            post("/v1/lora/unload", {})
        print(f"{v}: {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()

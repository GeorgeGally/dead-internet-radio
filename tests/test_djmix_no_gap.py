import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import djmix


def render(path, sound=3, lead=0, tail=0):
    """A tone with a silent head and/or tail, as ACE-Step renders one."""
    filters = []
    if lead:
        filters.append(f"adelay={int(lead * 1000)}")
    if tail:
        filters.append(f"apad=pad_dur={tail}")
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
           "-i", f"sine=frequency=440:duration={sound}"]
    if filters:
        cmd += ["-af", ",".join(filters)]
    subprocess.run(cmd + ["-c:a", "libmp3lame", "-q:a", "5", str(path)],
                   check=True, capture_output=True)


def silent_runs(path, threshold="-40dB", minimum=0.5):
    log = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"silencedetect=n={threshold}:d={minimum}", "-f", "null", "-",
    ], capture_output=True, text=True).stderr
    starts = [float(s) for s in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(s) for s in re.findall(r"silence_end: ([\d.]+)", log)]
    return [(s, ends[i] if i < len(ends) else None) for i, s in enumerate(starts)]


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is required")
class DjmixNoGapTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.show = self.root / "show"
        (self.show / "prompts").mkdir(parents=True)
        self.empty_ids = self.root / "station-ids"
        self.empty_ids.mkdir()

    def tearDown(self):
        shutil.rmtree(self.root)

    def write_track(self, number, name, title, artist, **render_args):
        render(self.show / f"{number:02d}-{name}-dead-internet-radio.mp3", **render_args)
        prompt = self.show / "prompts" / f"{number:02d}-{name}.prompt.json"
        prompt.write_text(json.dumps({"track": number, "slot": "night",
                                      "payload": {"title": title, "artist": artist}}))

    def span(self, path, duration):
        return djmix.audible_span(path, duration)

    def test_audible_span_trims_both_ends_but_keeps_whole_silent_files(self):
        path = self.root / "tail.mp3"
        render(path, sound=3, lead=1, tail=2)
        start, end = self.span(path, 6)
        self.assertAlmostEqual(start, 1.1, delta=0.15)
        self.assertAlmostEqual(end, 4.1, delta=0.15)

        # A real render can have a little quiet audio before its head silence;
        # that whole opening stretch must be trimmed too.
        lead_in = self.root / "lead-in.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=3",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=2",
            "-filter_complex", "[0][1][2][3]concat=n=4:v=0:a=1",
            "-c:a", "libmp3lame", "-q:a", "5", str(lead_in),
        ], check=True, capture_output=True)
        start, end = self.span(lead_in, 9)
        self.assertAlmostEqual(start, 4.1, delta=0.2)
        self.assertAlmostEqual(end, 7.1, delta=0.2)

        plain = self.root / "plain.mp3"
        render(plain, sound=3)
        self.assertEqual(self.span(plain, 3), (0.0, 3.0))

        silent = self.root / "silent.mp3"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
                        "-i", "anullsrc=r=44100:cl=mono:d=3", "-c:a", "libmp3lame",
                        "-q:a", "5", str(silent)], check=True, capture_output=True)
        self.assertEqual(self.span(silent, 3), (0.0, 3.0))

    def test_mix_cues_follow_trimmed_timeline_with_no_boundary_silence(self):
        self.write_track(1, "alpha", "Alpha", "A", sound=3, lead=1, tail=2)
        self.write_track(2, "beta", "Beta", "B", sound=3, lead=1, tail=2)
        out = self.root / "mix.mp3"

        argv = ["djmix.py", str(self.show), "--output", str(out),
                "--crossfade", "1", "--voice-reverb", "0"]
        with patch.object(sys, "argv", argv), \
             patch.object(djmix, "STATION_IDS_DIR", self.empty_ids):
            djmix.main()

        cues = json.loads(out.with_suffix(".cues.json").read_text())
        # With 3 s of audible sound per track and a 1 s crossfade, track 2
        # enters at 2 s. The raw files were 6 s long, so an untrimmed mix
        # would have put the cue at 5 s instead.
        self.assertAlmostEqual(cues[0]["time"], 0.0, delta=0.2)
        self.assertAlmostEqual(cues[1]["time"], 2.0, delta=0.2)
        self.assertEqual([c["title"] for c in cues], ["Alpha", "Beta"])

        runs = [r for r in silent_runs(out) if r[1] is None or r[1] - r[0] >= 0.5]
        boundary = [(s, e) for s, e in runs if 1.2 <= s <= 2.8]
        self.assertEqual(boundary, [], f"dead air at the DJ/next-song boundary: {boundary}")


if __name__ == "__main__":
    unittest.main()

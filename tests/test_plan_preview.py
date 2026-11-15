import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


SONGS = [
    {"title": "Wire Kiss", "artist": "Neon Hex", "caption": "electroclash, deadpan female voice",
     "lyrics": "[Verse]\nsay it\nsay it again\ncold light", "bpm": 128, "keyscale": "A minor", "duration": 200},
    {"title": "Club Static", "artist": "Ohm Girls", "caption": "electroclash, analog drums, instrumental",
     "lyrics": "[Instrumental]", "bpm": 130, "keyscale": "D minor", "duration": 180},
]


def fake_llm(system_prompt, user_message):
    if "program brief for this slot" in user_message:
        return json.dumps({"show_name": "Robot Club", "brief": "A night of robots dancing under strip lights."})
    if "DJ_ANNOUNCE" in user_message:
        return "Dead Internet Radio. Robot Club. DJ Static."
    if "Compose 2 tracks" in user_message:
        return json.dumps(SONGS)
    raise AssertionError(f"unexpected LLM call: {user_message[:80]}")


class PlanPreviewTest(unittest.TestCase):
    def run_main(self, argv, output_dir, llm):
        out = io.StringIO()
        with patch.object(sys, "argv", ["generate.py", *argv]), \
             patch.object(generate, "OPENROUTER_API_KEY", "test"), \
             patch.object(generate, "OUTPUT_DIR", output_dir), \
             patch.object(generate, "call_llm", side_effect=llm) as call, \
             patch.object(generate, "avoid_block", return_value=""), \
             patch.object(generate, "taste_block", return_value=""), \
             contextlib.redirect_stdout(out):
            generate.main()
        return call, out.getvalue()

    def test_plan_out_writes_the_plan_and_leaves_no_show(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir, plan_path = Path(tmp) / "output", Path(tmp) / "plan.json"
            self.run_main(["robot club", "--tracks", "2", "--delay", "0", "--dj-name", "Static",
                           "--plan-out", str(plan_path)], output_dir, fake_llm)
            plan = json.loads(plan_path.read_text())
            self.assertFalse(output_dir.exists())
        self.assertEqual(plan["slot"], "robot club")
        self.assertEqual(plan["show_name"], "Robot Club")
        self.assertEqual(plan["dj_name"], "Static")
        self.assertEqual(plan["dj_announce"], "Dead Internet Radio. Robot Club. DJ Static.")
        self.assertEqual([t["title"] for t in plan["tracks"]], ["Wire Kiss", "Club Static"])
        self.assertEqual(set(plan["tracks"][0]), set(generate.PLAN_SONG_KEYS))
        for track in plan["tracks"]:
            self.assertTrue(generate.MIN_TRACK_SECONDS <= track["duration"] <= generate.MAX_TRACK_SECONDS)

    def test_an_edited_plan_is_sent_exactly_without_llm_calls(self):
        edited = {
            "slot": "robot club", "show_name": "Edited Club", "brief": "My own brief.",
            "dj_name": "Kode Red", "dj_announce": "My own opening words.",
            "tracks": [{**SONGS[0], "title": "My Title", "caption": "a voice speaks", "lyrics": "[Verse]\none",
                        "duration": 333, "bpm": 99}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "output"
            call, log = self.run_main([f"plan {json.dumps(edited)}", "--dry-run", "--delay", "0"], output_dir, fake_llm)
            call.assert_not_called()
            show_dir = next(output_dir.iterdir())
            self.assertTrue(show_dir.name.startswith("robot-club-"))
            state = json.loads((show_dir / ".resume_state.json").read_text())
            meta = json.loads((show_dir / "show.json").read_text())
            intro = json.loads(next((show_dir / "prompts").glob("00-*.prompt.json")).read_text())
        self.assertIn(f"Show folder: {output_dir}", log)
        self.assertEqual(state["show_name"], "Edited Club")
        self.assertEqual(state["brief"], "My own brief.")
        self.assertEqual(meta["dj_name"], "Kode Red")
        self.assertEqual(intro["text"], "My own opening words.")
        self.assertEqual(state["track_history"][0]["payload"], edited["tracks"][0])

    def test_a_plan_without_tracks_is_refused(self):
        with self.assertRaises(ValueError):
            generate.read_plan('plan {"tracks": []}')
        self.assertIsNone(generate.read_plan("plan night"))


if __name__ == "__main__":
    unittest.main()

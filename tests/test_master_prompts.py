import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


class MasterPromptsTest(unittest.TestCase):
    def setUp(self):
        generate._chosen_prompts = None
        generate._prompts_used.clear()
        self.addCleanup(generate._prompts_used.clear)
        self.addCleanup(setattr, generate, "_chosen_prompts", None)
        missing = Path(tempfile.mkdtemp()) / "active-prompts.json"
        patcher = patch.object(generate, "ACTIVE_PROMPTS_PATH", missing)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_without_a_library_each_kind_is_its_seed_file(self):
        for kind, info in generate.master_kinds().items():
            self.assertEqual(generate.master_prompt(kind), (generate.PROMPTS_DIR / info["file"]).read_text().strip())
            self.assertEqual(generate.prompts_used()[kind]["name"], "Original")

    def test_the_active_file_is_read_when_the_run_names_none(self):
        generate.ACTIVE_PROMPTS_PATH.write_text(json.dumps({"prompts": {"dj": {"name": "Flat", "version": 2, "body": "Flat voice."}}}))
        self.assertEqual(generate.master_prompt("dj"), "Flat voice.")
        self.assertEqual(generate.master_prompt("music"), generate.original_prompt("music"))

    def test_a_slot_carries_its_prompts(self):
        slot = generate.unwrap_slot("prompts " + json.dumps({"slot": "plan {}", "prompts": {"music": {"name": "Darker", "version": 3, "body": "Darker."}}}))
        self.assertEqual(slot, "plan {}")
        self.assertEqual(generate.master_prompt("music"), "Darker.")
        self.assertEqual(generate.unwrap_slot("late night"), "late night")

    def test_an_empty_prompt_is_original(self):
        generate.use_prompts({"brief": {"name": "Blank", "body": "  "}})
        self.assertEqual(generate.master_prompt("brief"), generate.original_prompt("brief"))

    def test_unreadable_answers_fall_back_to_original_for_the_rest_of_the_run(self):
        generate.use_prompts({"music": {"name": "Broken", "version": 1, "body": "Say hello."}})
        seen = []

        def llm(system, user):
            seen.append(system)
            return "hello" if system == "Say hello." else '[{"caption": "x"}, {"caption": "y"}]'

        with patch.object(generate, "call_llm", side_effect=llm):
            songs = generate.ask_llm("music", "compose", generate.extract_json_array)
        self.assertEqual(len(songs), 2)
        self.assertEqual(seen, ["Say hello.", generate.original_prompt("music")])
        self.assertTrue(generate.prompts_used()["music"]["fell_back"])
        self.assertEqual(generate.master_prompt("music"), generate.original_prompt("music"))

    def test_original_failing_still_raises(self):
        with patch.object(generate, "call_llm", return_value="no json"):
            with self.assertRaises(ValueError):
                generate.ask_llm("music", "compose", generate.extract_json_array)

    def test_the_show_logs_which_prompts_wrote_it(self):
        generate.use_prompts({"dj": {"name": "Flat", "version": 2, "body": "Flat voice."}})
        generate.master_prompt("dj")
        out = Path(tempfile.mkdtemp())
        generate.log_prompts_used(out)
        self.assertEqual(json.loads((out / "master-prompts.json").read_text())["dj"], {"name": "Flat", "version": 2})


if __name__ == "__main__":
    unittest.main()

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


class RemixVoiceTest(unittest.TestCase):
    def test_voice_retry_rejects_json_fields_and_preserves_original(self):
        original = {"caption": "A voice speaks", "lyrics": "[Verse]\nREQUEST RECEIVED", "title": "Sliced", "artist": "Gold"}
        reply = '{\n "caption": "noise",\n "bpm": 120,\n "title": "song"\n}'
        with patch.object(generate, "call_llm", return_value=reply):
            result = generate.ensure_voice(original)
        self.assertEqual(generate.sung_lines(result["lyrics"]), ["REQUEST RECEIVED", "Sliced", "Gold"])
        self.assertEqual(original["lyrics"], "[Verse]\nREQUEST RECEIVED")

    def test_json_retry_accepts_only_object_with_string_lyrics(self):
        song = {"caption": "A voice speaks", "lyrics": "[Instrumental]", "title": "Sliced", "artist": "Gold"}
        for reply in ('[\n"one",\n"two",\n"three"\n]', '"one\\ntwo\\nthree"', '123', 'null', 'true', '{"lyrics": ["one", "two", "three"]}'):
            with self.subTest(reply=reply), patch.object(generate, "call_llm", return_value=reply):
                result = generate.ensure_voice(song)
                self.assertEqual(generate.sung_lines(result["lyrics"]), ["Sliced", "Gold", "Sliced"])
        with patch.object(generate, "call_llm", return_value='{"lyrics": "one\\ntwo\\nthree"}'):
            self.assertEqual(generate.ensure_voice(song)["lyrics"], "one\ntwo\nthree")

    def test_retry_preserves_existing_lines(self):
        song = {"caption": "A voice speaks", "lyrics": "[Verse]\nREQUEST RECEIVED", "title": "Sliced", "artist": "Gold"}
        with patch.object(generate, "call_llm", return_value="one\ntwo\nthree"):
            result = generate.ensure_voice(song)
        self.assertEqual(generate.sung_lines(result["lyrics"]), ["REQUEST RECEIVED", "Sliced", "Gold"])
        with patch.object(generate, "call_llm", return_value="REQUEST RECEIVED\none\ntwo"):
            result = generate.ensure_voice(song)
        self.assertEqual(result["lyrics"], "REQUEST RECEIVED\none\ntwo")

    def test_colon_lyrics_are_preserved(self):
        song = {"caption": "A voice speaks", "lyrics": "[Verse]\nSYSTEM: ONLINE", "title": "Sliced", "artist": "Gold"}
        with patch.object(generate, "call_llm", return_value="one\ntwo\nthree"):
            result = generate.ensure_voice(song)
        self.assertEqual(generate.sung_lines(result["lyrics"]), ["SYSTEM: ONLINE", "Sliced", "Gold"])
        full = {**song, "lyrics": "SYSTEM: ONLINE\nready\nlistening"}
        with patch.object(generate, "call_llm") as llm:
            self.assertEqual(generate.ensure_voice(full), full)
            llm.assert_not_called()

    def test_negated_voice_list_and_separate_positive_voice(self):
        for caption in ("No singing or vocals, just synthesizers", "Without voices and singing and vocals", "No female vocals"):
            with self.subTest(caption=caption), patch.object(generate, "call_llm") as llm:
                song = {"caption": caption, "lyrics": "[Instrumental]"}
                self.assertEqual(generate.ensure_voice(song), song)
                llm.assert_not_called()
        self.assertTrue(generate.describes_voice("No singing or vocals, but a voice speaks through a telephone"))

    def test_caption_speech_and_negated_clauses(self):
        silent = ("No spoken voice, only synthesizers", "No singing or vocals, just synthesizers",
                  "60Hz mains hum", "Free of speech and vocals; synthesizers", "Instrumental only, no voice")
        for caption in silent:
            with self.subTest(caption=caption), patch.object(generate, "call_llm") as llm:
                song = {"caption": caption, "lyrics": "[Instrumental]"}
                self.assertEqual(generate.ensure_voice(song), song)
                llm.assert_not_called()
        for caption in ("A man murmurs through a telephone", "She mutters", "He mumbles", "She shouts",
                        "Someone yells", "A person screams", "He recited a line", "She reads aloud",
                        "No vocals - a voice speaks", "No vocals, voice through a telephone"):
            with self.subTest(caption=caption), patch.object(generate, "call_llm", return_value="one\ntwo\nthree"):
                result = generate.ensure_voice({"caption": caption, "lyrics": "[Instrumental]"})
                self.assertEqual(result["lyrics"], "one\ntwo\nthree")

    def test_take_collision_preserves_existing_folder_on_failure(self):
        song = {"caption": "synthesizers", "lyrics": "[Instrumental]", "title": "Sliced", "artist": "Gold", "duration": 150}
        with tempfile.TemporaryDirectory(dir=".") as directory:
            output = Path(directory)
            existing = output / "remix-20261112-120000"
            existing.mkdir()
            (existing / "show.json").write_text("original metadata")
            with patch.object(generate, "OUTPUT_DIR", output), \
                 patch.object(generate.time, "strftime", side_effect=["20261112-120000", "20261112-120001"]), \
                 patch.object(generate.time, "sleep") as sleep, \
                 patch.object(generate, "check_ace_step_health", return_value=(False, "offline")):
                with self.assertRaisesRegex(RuntimeError, "offline"):
                    generate.render_take({"payload": song})
            sleep.assert_called_once_with(1)
            self.assertEqual((existing / "show.json").read_text(), "original metadata")
            self.assertFalse((output / "remix-20261112-120001").exists())

    def test_take_records_lyrics_sent_to_renderer_and_remix_kind(self):
        song = {"caption": "A voice speaks", "lyrics": "[Instrumental]", "title": "Sliced", "artist": "Gold", "bpm": 120, "keyscale": "C", "duration": 150}
        with tempfile.TemporaryDirectory(dir=".") as directory, \
             patch.object(generate, "OUTPUT_DIR", Path(directory)), \
             patch.object(generate, "call_llm", return_value='{"lyrics":"one\\ntwo\\nthree"}'), \
             patch.object(generate, "check_ace_step_health", return_value=(True, None)), \
             patch.object(generate, "call_ace_step", return_value="task") as render, \
             patch.object(generate, "poll_ace_step", return_value={"result": '[{"file":"audio"}]'}), \
             patch.object(generate, "download_audio", side_effect=lambda _, dest: dest.write_bytes(b'x' * 1001)), \
             contextlib.redirect_stdout(io.StringIO()):
            generate.render_take({"payload": song, "file": "output/original.mp3"}, "DJ")
            folder = next(Path(directory).iterdir())
            metadata = json.loads((folder / "show.json").read_text())
            log = json.loads(next((folder / "prompts").iterdir()).read_text())
        self.assertEqual(metadata["kind"], "remix")
        self.assertEqual(metadata["dj_name"], "DJ")
        self.assertEqual(log["payload"]["lyrics"], "one\ntwo\nthree")
        self.assertEqual(render.call_args.args[0], log["payload"])
        self.assertEqual(song["lyrics"], "[Instrumental]")


if __name__ == "__main__":
    unittest.main()

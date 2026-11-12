import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import generate
from pathlib import Path


class RemixPublicationTest(unittest.TestCase):
    def test_in_progress_take_is_not_published(self):
        script = Path(__file__).absolute().parent.parent / "build_site.py"
        song = {"caption": "synthesizers", "lyrics": "[Instrumental]", "title": "Sliced", "artist": "Gold", "duration": 150}
        with tempfile.TemporaryDirectory(dir=".") as tmp:
            root = Path(tmp).absolute()
            output = root / "output"
            output.mkdir()

            def download(_, dest):
                metadata = json.loads((dest.parent / "show.json").read_text())
                prompt = json.loads(next((dest.parent / "prompts").iterdir()).read_text())
                self.assertEqual(metadata["kind"], "remix")
                self.assertEqual(prompt["payload"], song)
                dest.write_bytes(b"x" * 1001)
                subprocess.run([sys.executable, str(script), "--shows-only"], cwd=root, check=True, capture_output=True)
                self.assertEqual(json.loads((root / "dist" / "shows.json").read_text())["shows"], [])
                self.assertFalse((root / "dist" / "shows" / dest.parent.name).exists())

            with patch.object(generate, "OUTPUT_DIR", output), \
                 patch.object(generate, "check_ace_step_health", return_value=(True, None)), \
                 patch.object(generate, "call_ace_step", return_value="task"), \
                 patch.object(generate, "poll_ace_step", return_value={"result": '[{"file":"audio"}]'}), \
                 patch.object(generate, "download_audio", side_effect=download):
                generate.render_take({"payload": song, "file": "output/original.mp3"}, "DJ")

    def test_public_build_excludes_remix_but_importer_reads_it(self):
        script = Path(__file__).absolute().parent.parent / "build_site.py"
        with tempfile.TemporaryDirectory(dir=".") as tmp:
            root = Path(tmp).absolute()
            output = root / "output"
            output.mkdir()
            for folder, kind in (("remix-20261112-120000", "remix"), ("show-20261112-120000", "show")):
                show = output / folder
                show.mkdir()
                (show / "show.json").write_text(json.dumps({"kind": kind, "show_name": kind, "dj_name": "DJ"}))
                (show / "01-song-dead-internet-radio.mp3").write_bytes(b"audio")
            old = root / "dist" / "shows" / "remix-20261112-120000"
            old.mkdir(parents=True)
            (old / "playlist.json").write_text("{}")
            subprocess.run([sys.executable, str(script), "--shows-only"], cwd=root, check=True, capture_output=True)
            manifest = json.loads((root / "dist" / "shows.json").read_text())
            self.assertEqual([show["id"] for show in manifest["shows"]], ["show-20261112-120000"])
            self.assertFalse(old.exists())
            self.assertTrue((root / "dist" / "shows" / "show-20261112-120000" / "playlist.json").exists())
            imported = subprocess.run([sys.executable, str(script), "--show-json", "remix-20261112-120000"], cwd=root, check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(imported.stdout)["tracks"][0]["file"], "01-song-dead-internet-radio.mp3")
            (output / "show-20261112-120000" / "01-song-dead-internet-radio.mp3").unlink()
            subprocess.run([sys.executable, str(script), "--shows-only"], cwd=root, check=True, capture_output=True)
            self.assertEqual(json.loads((root / "dist" / "shows.json").read_text())["shows"], [])


if __name__ == "__main__":
    unittest.main()

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class RemixPublicationTest(unittest.TestCase):
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

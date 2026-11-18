# Jobs send the active library prompt, not prompts/dj.md, and the Music
# "Original" row still holds the DJ prompt from when the library began. The
# rewritten prompts/dj.md goes in as "Darkroom" and becomes the one in use;
# every earlier prompt stays in the library to switch back to.
class ActivateDarkroomMusicPrompt < ActiveRecord::Migration[8.0]
  NAME = "Darkroom"

  def up
    MasterPrompt.reset_column_information
    MasterPrompt.ensure_seeded!
    prompt = MasterPrompt.of("music").find_by(name: NAME) ||
             MasterPrompt.create!(kind: "music", name: NAME, body: MasterPrompt.original_body("music"),
                                  notes: "prompts/dj.md rewritten around rhythm, bass, signature sounds and one room (2026-11-18).")
    prompt.activate!
  end

  def down
    MasterPrompt.of("music").find_by(name: MasterPrompt::ORIGINAL)&.activate!
  end
end

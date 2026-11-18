# frozen_string_literal: true

require "test_helper"
require Rails.root.join("db/migrate/20261118120000_activate_darkroom_music_prompt")

class DarkroomPromptMigrationTest < ActiveSupport::TestCase
  test "the rewritten DJ prompt becomes the Music prompt in use, and down goes back to Original" do
    MasterPrompt.ensure_seeded!
    MasterPrompt.active_for("music").update!(body: "The old DJ prompt.")
    migration = ActivateDarkroomMusicPrompt.new
    migration.verbose = false

    migration.up
    active = MasterPrompt.active_for("music")
    assert_equal "Darkroom", active.name
    assert_equal Rails.root.join("prompts/dj.md").read.strip, active.body
    assert_empty active.missing_keys
    assert MasterPrompt.of("music").exists?(name: "Original", body: "The old DJ prompt.")

    migration.up
    assert_equal 1, MasterPrompt.of("music").where(name: "Darkroom").count

    migration.down
    assert_equal "Original", MasterPrompt.active_for("music").name
  end
end

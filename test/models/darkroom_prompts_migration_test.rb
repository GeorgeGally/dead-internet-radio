# frozen_string_literal: true

require "test_helper"
require Rails.root.join("db/migrate/20261118120000_activate_darkroom_prompts")

class DarkroomPromptsMigrationTest < ActiveSupport::TestCase
  test "the rewritten prompts become the ones in use, and down goes back to Original" do
    MasterPrompt.ensure_seeded!
    MasterPrompt.active_for("music").update!(body: "The old DJ prompt.")
    migration = ActivateDarkroomPrompts.new
    migration.verbose = false

    migration.up
    { "music" => "dj.md", "rewrite" => "rerender.md", "brief" => "producer.md" }.each do |kind, file|
      active = MasterPrompt.active_for(kind)
      assert_equal "Darkroom", active.name, kind
      assert_equal Rails.root.join("prompts", file).read.strip, active.body
      assert_empty active.missing_keys, kind
    end
    assert MasterPrompt.of("music").exists?(name: "Original", body: "The old DJ prompt.")
    assert_equal "Original", MasterPrompt.active_for("dj").name

    migration.up
    assert_equal 1, MasterPrompt.of("music").where(name: "Darkroom").count

    migration.down
    %w[music rewrite brief].each { |kind| assert_equal "Original", MasterPrompt.active_for(kind).name }
  end
end

# frozen_string_literal: true

require "test_helper"

class MasterPromptTest < ActiveSupport::TestCase
  test "each kind starts with its seed file as Original, in use" do
    MasterPrompt.ensure_seeded!
    MasterPrompt::KINDS.each do |kind, info|
      original = MasterPrompt.active_for(kind)
      assert_equal "Original", original.name
      assert_equal Rails.root.join("prompts", info["file"]).read.strip, original.body
      assert_empty original.missing_keys, kind
    end
  end

  test "one prompt in use per kind, and the one in use is never deleted" do
    MasterPrompt.ensure_seeded!
    original = MasterPrompt.active_for("music")
    darker = MasterPrompt.create!(kind: "music", name: "Darker", body: original.body + "\nDarker.")
    darker.activate!

    assert_equal darker, MasterPrompt.active_for("music")
    assert_not original.reload.active?
    assert_not darker.destroy
    assert original.destroy
  end

  test "editing the text moves the version on" do
    MasterPrompt.ensure_seeded!
    prompt = MasterPrompt.active_for("dj")
    prompt.update!(notes: "only notes")
    assert_equal 1, prompt.version
    prompt.update!(body: "#{prompt.body}\nOne more line.")
    assert_equal 2, prompt.version
  end

  test "a prompt that drops a word the pipeline reads is flagged, not refused" do
    prompt = MasterPrompt.new(kind: "music", name: "Short", body: "Write a song. Give a caption and lyrics.")
    assert prompt.valid?
    assert_includes prompt.missing_keys, "bpm"
    assert_not_includes prompt.missing_keys, "caption"
  end

  test "a job is written with the prompts picked for it, else the ones in use, frozen at start" do
    MasterPrompt.ensure_seeded!
    darker = MasterPrompt.create!(kind: "music", name: "Darker", body: "caption lyrics darker")
    job = GenerationJob.create!(slot: "late night", track_count: 2, status: :pending,
                                options: { "prompts" => { "music" => darker.id } })
    job.freeze_prompts!

    sent = JSON.parse(job.generate_slot.delete_prefix("prompts "))
    assert_equal "late night", sent["slot"]
    assert_equal "Darker", sent["prompts"]["music"]["name"]
    assert_equal "Original", sent["prompts"]["dj"]["name"]

    darker.update!(body: "changed after the job started")
    assert_equal "caption lyrics darker", JSON.parse(job.reload.generate_slot.delete_prefix("prompts "))["prompts"]["music"]["body"]
  end

  test "the library is written where generate.py reads it" do
    MasterPrompt.ensure_seeded!
    MasterPrompt.write_active!
    written = JSON.parse(MasterPrompt::ACTIVE_FILE.read)["prompts"]
    assert_equal MasterPrompt::KINDS.keys.sort, written.keys.sort
    assert_equal "Original", written["brief"]["name"]
  end
end

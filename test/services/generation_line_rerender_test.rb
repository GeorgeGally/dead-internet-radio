# frozen_string_literal: true

require "test_helper"

class GenerationLineRerenderTest < ActiveSupport::TestCase
  setup do
    @lib_slug = "line-rerender-lib-#{Process.pid}"
    @remix_slug = "line-rerender-remix-#{Process.pid}"
    @show_dir = Rails.root.join("output", @lib_slug)
    @remix_dir = Rails.root.join("output", @remix_slug)
    FileUtils.mkdir_p([@show_dir, @show_dir.join("prompts"), @remix_dir, @remix_dir.join("prompts")])
    lib = Show.create!(slot: "night", directory: @lib_slug, status: :complete)
    @song = lib.tracks.create!(position: 1, artist: "Jumpers", title: "Fatties", bpm: 126, duration_ms: 150_000,
                               audio_file: "01-fatties.mp3")
    File.write(@show_dir.join("01-fatties.mp3"), "original")
    File.write(@show_dir.join("prompts", "01-fatties.prompt.json"),
               JSON.generate(payload: { caption: "darkwave", bpm: 126, duration: 150 }))

    @remix = Show.create!(slot: "remix", kind: "remix", directory: @remix_slug, status: :complete)
    @rendered = @remix.tracks.create!(position: 1, artist: "Jumpers", title: "Fatties", bpm: 126, duration_ms: 160_000,
                                      audio_file: "01-fatties-dead-internet-radio.mp3")
    File.write(@remix_dir.join("01-fatties-dead-internet-radio.mp3"), "re-rendered")
    File.write(@remix_dir.join("prompts", "01-fatties-dead-internet-radio.prompt.json"),
               JSON.generate(payload: { caption: "darker", bpm: 126, duration: 160 }))

    @job = GenerationJob.create!(slot: "rerender", track_count: 1, status: :pending,
                                 options: { "kind" => "rerender", "track_id" => @song.id,
                                            "instructions" => "super dark", "on_pc" => true })
  end

  teardown do
    FileUtils.rm_rf(@show_dir)
    FileUtils.rm_rf(@remix_dir)
  end

  test "a finished PC re-render folds onto the library song" do
    GenerationLine.mark!(@job.id, "done", @remix_slug)

    assert @job.reload.done?
    refute Show.exists?(@remix.id)
    assert_equal "re-rendered", File.read(@show_dir.join("01-fatties.mp3"))
    assert @show_dir.join(".replaced").glob("01-fatties-*.mp3").any?
    assert_equal @song.show_id, @job.show_id
  end
end
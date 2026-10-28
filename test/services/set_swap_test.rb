# frozen_string_literal: true

require "test_helper"

class SetSwapTest < ActiveSupport::TestCase
  setup do
    @root = Dir.mktmpdir
    lib_dir = File.join(@root, "lib-show")
    @set_dir = File.join(@root, "a-set")
    [lib_dir, @set_dir].each { |d| FileUtils.mkdir_p(d) }
    lib = Show.create!(slot: "night", directory: lib_dir, status: :complete)
    @old = lib.tracks.create!(position: 1, artist: "Old Band", title: "Old Song", bpm: 100, duration_ms: 150_000, audio_file: "01-old.mp3")
    @new = lib.tracks.create!(position: 2, artist: "New Band", title: "New Song", bpm: 102, duration_ms: 180_000, audio_file: "02-new.mp3")
    File.write(File.join(lib_dir, "01-old.mp3"), "old")
    File.write(File.join(lib_dir, "02-new.mp3"), "new")

    set = Show.create!(slot: "night", directory: @set_dir, status: :complete, kind: "set")
    @slot = set.tracks.create!(position: 2, artist: "Old Band", title: "Old Song", duration_ms: 150_000, origin_track: @old,
                               audio_file: "01-old.mp3", voiceover_file: "00-DJ-voice-old.mp3")
    @after = set.tracks.create!(position: 3, artist: "X", title: "Y", duration_ms: 100_000, audio_file: "02-y.mp3")
    File.link(File.join(lib_dir, "01-old.mp3"), File.join(@set_dir, "01-old.mp3"))
    File.write(File.join(@set_dir, "00-DJ-voice-old.mp3"), "voice")
  end

  teardown { FileUtils.rm_rf(@root) }

  test "the new song takes the slot, the old file and its intro are kept, bookings shift" do
    at = Time.current
    seg = BroadcastSegment.create!(track: @slot, starts_at: at + 60, ends_at: at + 210)
    later = BroadcastSegment.create!(track: @after, starts_at: at + 210, ends_at: at + 310)

    SetSwap.swap!(@slot, @new, at: at)

    @slot.reload
    assert_equal [@new.id, "New Band", nil], [@slot.origin_track_id, @slot.artist, @slot.voiceover_file]
    assert_equal "01-new.mp3", @slot.audio_file
    assert_equal "new", File.read(File.join(@set_dir, "01-new.mp3"))
    assert File.exist?(File.join(@set_dir, ".replaced", "01-old.mp3"))
    assert File.exist?(File.join(@set_dir, ".replaced", "00-DJ-voice-old.mp3"))
    assert_in_delta at + 240, seg.reload.ends_at, 0.01
    assert_in_delta at + 240, later.reload.starts_at, 0.01
  end

  test "a song on air can't be swapped" do
    BroadcastSegment.create!(track: @slot, starts_at: 1.minute.ago, ends_at: 2.minutes.from_now)
    assert_raises(SetSwap::Error) { SetSwap.swap!(@slot, @new) }
  end

  test "candidates leave out songs already in the set" do
    ids = SetSwap.candidates(@slot).map(&:id)
    refute_includes ids, @old.id
  end
end

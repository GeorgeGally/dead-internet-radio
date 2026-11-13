# frozen_string_literal: true

require "test_helper"

class StationMixOutTest < ActiveSupport::TestCase
  setup do
    @root = Dir.mktmpdir
    BroadcastSegment.delete_all
  end

  teardown { FileUtils.rm_rf(@root) }

  test "a song's silent tail is not booked, so the next track comes straight in" do
    # Three seconds of sound fading into four of silence, as ACE-Step renders end.
    file = File.join(@root, "01-song.mp3")
    system("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
           "-af", "apad=pad_dur=4", "-ar", "44100", file, exception: true)
    show = Show.create!(slot: "night", directory: @root, status: :complete, kind: "show", name: "tail")
    song = show.tracks.create!(position: 1, title: "Song", artist: "Someone", duration_ms: 7_000, audio_file: "01-song.mp3")

    MeasureMixOutsJob.perform_now
    Station.fill!

    seg = BroadcastSegment.where(track: song).chronological.first
    assert_in_delta 3.3, seg.ends_at - seg.starts_at, 0.3
    nxt = BroadcastSegment.where("starts_at >= ?", seg.ends_at).chronological.first
    assert_in_delta 0, nxt.starts_at - seg.ends_at, 0.01
  end
end

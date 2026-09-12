# frozen_string_literal: true

require "test_helper"

class AdminTracksControllerTest < ActionDispatch::IntegrationTest
  setup do
    ENV["ADMIN_USERNAME"] = "admin"
    ENV["ADMIN_PASSWORD"] = "secret"
    @show_dir = File.join(Dir.mktmpdir, "test-show-20260101-000000")
    FileUtils.mkdir_p(File.join(@show_dir, ".removed"))
    @show = Show.create!(
      slot: "test slot",
      name: "Test Show",
      track_count: 2,
      directory: @show_dir,
      status: :complete
    )
    @track = Track.create!(
      show: @show,
      position: 2,
      title: "Bad Track",
      artist: "Test Artist",
      audio_file: File.join(@show_dir, "02-bad-track.mp3")
    )
    Track.create!(show: @show, position: 1, title: "Good Track", artist: "Test Artist")
    File.write(File.join(@show_dir, "02-bad-track.mp3"), "audio")
    File.write(File.join(@show_dir, "02-bad-track-DJ-voice-test.mp3"), "voice")
    File.write(File.join(@show_dir, "01-keep-me.mp3"), "audio")

    post admin_login_path, params: { username: "admin", password: "secret" }
  end

  teardown do
    ENV.delete("ADMIN_USERNAME")
    ENV.delete("ADMIN_PASSWORD")
    FileUtils.rm_rf(@show_dir)
  end

  test "remove moves audio files to .removed and updates track count" do
    assert_equal 2, @show.tracks.count

    delete admin_track_path(@track)
    assert_redirected_to admin_show_path(@show)

    refute Track.exists?(@track.id)
    assert_equal 1, @show.reload.track_count
    refute File.exist?(File.join(@show_dir, "02-bad-track.mp3"))
    refute File.exist?(File.join(@show_dir, "02-bad-track-DJ-voice-test.mp3"))
    assert File.exist?(File.join(@show_dir, ".removed", "02-bad-track.mp3"))
    assert File.exist?(File.join(@show_dir, ".removed", "02-bad-track-DJ-voice-test.mp3"))
    assert File.exist?(File.join(@show_dir, "01-keep-me.mp3")), "sibling tracks must be untouched"
  end
end

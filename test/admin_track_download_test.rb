ENV["RAILS_ENV"] = "test"
require_relative "../config/environment"
require "rails/test_help"
require "tmpdir"

class AdminTrackDownloadTest < ActionDispatch::IntegrationTest
  test "public download remains available and admin can use the button" do
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "track.mp3"), "audio data")
      show = Show.create!(slot: "test", directory: dir)
      track = Track.create!(show: show, position: 1, artist: "An Artist", title: "A Song", audio_file: "track.mp3")

      get download_media_track_path(track)
      assert_response :success
      assert_equal "audio data", response.body
      assert_match(/attachment;.*An%20Artist%20-%20A%20Song\.mp3/, response.headers["Content-Disposition"])

      post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
      get admin_track_path(track)
      assert_response :success
      assert_select "a.btn-key[href=?]", download_media_track_path(track), text: "Download"

      get download_media_track_path(track)
      assert_response :success
      assert_equal "audio data", response.body
      assert_match(/attachment;.*An%20Artist%20-%20A%20Song\.mp3/, response.headers["Content-Disposition"])

      File.delete(File.join(dir, "track.mp3"))
      get admin_track_path(track)
      assert_select "a.btn-key[href=?]", download_media_track_path(track), count: 0
      get download_media_track_path(track)
      assert_response :not_found
    end
  end
end

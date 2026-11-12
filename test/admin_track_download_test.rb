ENV["RAILS_ENV"] = "test"
require_relative "../config/environment"
require "rails/test_help"
require "tmpdir"

class AdminTrackDownloadTest < ActionDispatch::IntegrationTest
  test "admin can download a track using its artist, title and file extension" do
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "track.wav"), "audio data")
      show = Show.create!(slot: "test", directory: dir)
      track = Track.create!(show: show, position: 1, artist: "An Artist", title: "A Song", audio_file: "track.wav")

      get download_media_track_path(track)
      assert_redirected_to admin_login_path

      post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
      get admin_track_path(track)
      assert_response :success
      assert_select "a.btn-key[href=?]", download_media_track_path(track), text: "Download"

      get download_media_track_path(track)
      assert_response :success
      assert_equal "audio data", response.body
      assert_match(/attachment;.*An%20Artist%20-%20A%20Song\.wav/, response.headers["Content-Disposition"])

      File.delete(File.join(dir, "track.wav"))
      get admin_track_path(track)
      assert_select "a.btn-key[href=?]", download_media_track_path(track), count: 0
      get download_media_track_path(track)
      assert_response :not_found
    end
  end
end

ENV["RAILS_ENV"] = "test"
require_relative "../config/environment"
require "rails/test_help"
require "tmpdir"
require "json"

class AdminRequestsTakesTest < ActionDispatch::IntegrationTest
  test "requests index lists earlier edits and remixes under the latest" do
    Dir.mktmpdir do |dir|
      File.binwrite(File.join(dir, "song.mp3"), "current audio")
      replaced = File.join(dir, ".replaced")
      Dir.mkdir(replaced)
      File.binwrite(File.join(replaced, "song-20260101-000000.mp3"), "old audio")
      File.write(File.join(replaced, "song-20260101-000000.prompt.json"),
                 JSON.generate("rerender" => { "notes" => "slower" }))

      show = Show.create!(slot: "test", directory: dir)
      track = Track.create!(show: show, position: 1, artist: "An Artist", title: "A Song",
                            audio_file: "song.mp3", duration_ms: 1000)
      user = User.create!(google_uid: "test-uid-takes", email: "takes@example.test")
      SongRequest.create!(user: user, artist: "An Artist", title: "A Song", status: :ready, track: track)

      post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"),
                                       password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
      get admin_requests_path
      assert_response :success
      assert_select ".takes-row"
      assert_select ".takes-row", text: /Earlier version/
      assert_select ".takes-row", text: /slower/
    end
  end
end

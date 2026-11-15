# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class AdminEditRemixUiTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    ENV["ADMIN_USERNAME"] = "admin"
    ENV["ADMIN_PASSWORD"] = "secret"
    post admin_login_path, params: { username: "admin", password: "secret" }

    @show_dir = File.join(Dir.mktmpdir, "ui-show")
    FileUtils.mkdir_p(File.join(@show_dir, "prompts"))
    @show = Show.create!(slot: "ui", name: "UI Show", track_count: 1, directory: @show_dir, status: :complete)
    @song = Track.create!(show: @show, position: 1, title: "Jumpers", artist: "Fatties",
                          audio_file: File.join(@show_dir, "01-jumpers.mp3"))
    File.write(File.join(@show_dir, "01-jumpers.mp3"), "x")
    File.write(File.join(@show_dir, "prompts", "01-jumpers.prompt.json"),
               JSON.generate(payload: { caption: "bouncy", lyrics: "[Instrumental]", bpm: 120 }))
    @user = User.create!(google_uid: "g-ui-#{Process.pid}", name: "Pat", email: "pat-ui@example.com")
  end

  teardown do
    ActiveJob::Base.queue_adapter = @old_queue_adapter
    ENV.delete("ADMIN_USERNAME")
    ENV.delete("ADMIN_PASSWORD")
    FileUtils.rm_rf(@show_dir)
  end

  test "inline edit notice says Editing" do
    post rerender_admin_track_path(@song), params: { instructions: "darker", inline: 1, request_id: 9 }
    assert_redirected_to admin_requests_path
    assert_equal "Editing Fatties — Jumpers", flash[:notice]
  end

  test "inline remix notice says Remixing and hits remix endpoint" do
    ActiveJob::Base.queue_adapter = :test
    post remix_admin_track_path(@song), params: { instructions: "faster", inline: 1, request_id: 9 }
    assert_redirected_to admin_requests_path
    assert_equal "Remixing Fatties — Jumpers", flash[:notice]
    assert_equal "remix", GenerationJob.last.options["kind"]
  end

  test "requests page shows track job loader for pending remix" do
    req = @user.song_requests.create!(title: "Jumpers", artist: "Fatties", status: :ready, track: @song)
    job = GenerationJob.create!(slot: "remix", track_count: 1, status: :running,
                                options: { "kind" => "remix", "track_id" => @song.id, "request_id" => req.id.to_s })
    get admin_requests_path
    assert_response :success
    assert_select ".track-job-loader[data-kind=remix]"
    assert_select ".track-job-loader a[href=?]", admin_generation_path(job)
  end
end
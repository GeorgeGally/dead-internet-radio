# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class AdminShowReeditTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    ENV["ADMIN_USERNAME"] = "admin"
    ENV["ADMIN_PASSWORD"] = "secret"
    post admin_login_path, params: { username: "admin", password: "secret" }

    @show_dir = File.join(Dir.mktmpdir, "show-reedit")
    FileUtils.mkdir_p(File.join(@show_dir, "prompts"))
    @show = Show.create!(slot: "reedit", name: "Re-edit Show", track_count: 2,
                         directory: @show_dir, status: :complete)
    @songs = %w[first second].each_with_index.map do |name, i|
      song = Track.create!(show: @show, position: i + 1, title: name, artist: "Test Artist",
                           audio_file: File.join(@show_dir, "0#{i + 1}-#{name}.mp3"))
      File.write(song.audio_path, "audio")
      File.write(File.join(@show_dir, "prompts", "0#{i + 1}-#{name}.prompt.json"),
                 JSON.generate(payload: { caption: "darkwave #{name}", bpm: 120 }))
      song
    end
  end

  teardown do
    ActiveJob::Base.queue_adapter = @old_queue_adapter
    ENV.delete("ADMIN_USERNAME")
    ENV.delete("ADMIN_PASSWORD")
    FileUtils.rm_rf(@show_dir)
  end

  test "the show page offers a whole-mix re-edit" do
    get admin_show_path(@show)

    assert_response :success
    assert_select "form[action=?]", reedit_admin_show_path(@show) do
      assert_select "input[name=instructions]"
    end
  end

  test "posting a direction edits every track and then remixes" do
    assert_difference -> { GenerationJob.count }, 2 do
      post reedit_admin_show_path(@show), params: { instructions: "darker, slower, more space" }
    end

    assert_redirected_to admin_show_path(@show)
    assert_equal "Editing 2 tracks, then the mix.", flash[:notice]
    jobs = GenerationJob.order(:id).last(2)
    assert_equal [ "darker, slower, more space" ], jobs.map { |j| j.options["instructions"] }.uniq
    assert_equal 1, jobs.map { |j| j.options["batch_id"] }.uniq.size
    assert_enqueued_jobs 2, only: RerenderTrackJob
    assert_no_enqueued_jobs only: RemixShowJob

    get admin_show_path(@show)
    assert_select ".track-job-loader[data-progress=?]", reedit_progress_admin_show_path(@show)
  end

  test "a blank direction is refused" do
    assert_no_difference -> { GenerationJob.count } do
      post reedit_admin_show_path(@show), params: { instructions: "  " }
    end

    assert_redirected_to admin_show_path(@show)
    assert_equal "Say what to change across the mix.", flash[:alert]
  end

  test "a show with no prompt logs is refused" do
    FileUtils.rm_rf(File.join(@show_dir, "prompts"))

    assert_no_difference -> { GenerationJob.count } do
      post reedit_admin_show_path(@show), params: { instructions: "darker" }
    end
    assert_equal "No track on this show has a prompt log to edit from.", flash[:alert]
  end

  test "a second re-edit of the same show is refused while one runs" do
    ShowReedit.start!(@show, @songs, "darker")

    assert_no_difference -> { GenerationJob.count } do
      post reedit_admin_show_path(@show), params: { instructions: "louder" }
    end
    assert_equal "A re-edit of this show is already running.", flash[:alert]
  end

  test "the progress line counts the tracks done" do
    ShowReedit.start!(@show, @songs, "darker")
    GenerationJob.order(:id).last(2).first.update!(status: :done, completed_at: Time.current)

    get reedit_progress_admin_show_path(@show), as: :json

    assert_response :success
    body = response.parsed_body
    assert_equal "running", body["status"]
    assert_equal "Editing track 2 of 2", body["stage"]
    assert_in_delta 0.5, body["fraction"]
  end
end

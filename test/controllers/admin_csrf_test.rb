# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class AdminCsrfTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_allow_forgery_protection = ActionController::Base.allow_forgery_protection
    @old_admin_username = ENV["ADMIN_USERNAME"]
    @old_admin_password = ENV["ADMIN_PASSWORD"]
    @old_queue_adapter = ActiveJob::Base.queue_adapter

    ActionController::Base.allow_forgery_protection = true
    ActiveJob::Base.queue_adapter = :test
    ENV["ADMIN_USERNAME"] = "admin"
    ENV["ADMIN_PASSWORD"] = "secret"
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @old_allow_forgery_protection
    ActiveJob::Base.queue_adapter = @old_queue_adapter
    ENV["ADMIN_USERNAME"] = @old_admin_username
    ENV["ADMIN_PASSWORD"] = @old_admin_password
  end

  test "generation retry page exposes csrf tokens for state changing controls" do
    job = GenerationJob.create!(
      slot: "late night",
      track_count: 4,
      status: :failed,
      output_log: "failed"
    )

    get admin_login_path
    assert_response :success

    authenticity_token = response.body[/name="authenticity_token" value="([^"]+)"/, 1]
    assert authenticity_token, "expected login form to include an authenticity token"

    post admin_login_path, params: {
      authenticity_token: authenticity_token,
      username: "admin",
      password: "secret"
    }
    assert_redirected_to admin_path

    get admin_generation_path(job)
    assert_response :success
    assert_select "meta[name='csrf-param'][content='authenticity_token']"
    assert_select "meta[name='csrf-token']"
    assert_select "form[action='#{retry_admin_generation_path(job)}'] input[name='authenticity_token']"

    retry_form = response.body[%r{<form[^>]+action="#{retry_admin_generation_path(job)}"[\s\S]*?</form>}]
    retry_token = retry_form&.match(/name="authenticity_token" value="([^"]+)"/)&.[](1)
    assert retry_token, "expected retry form to include an authenticity token"

    assert_enqueued_with(job: GenerateShowJob, args: [job.id]) do
      post retry_admin_generation_path(job), params: { authenticity_token: retry_token }
    end

    assert_redirected_to admin_generation_path(job)
    job.reload
    assert_predicate job, :pending?
    assert_nil job.started_at
    assert_nil job.completed_at
    assert_nil job.output_log
  end

  test "inline remix from a freshly loaded requests page passes csrf" do
    show_dir = Rails.root.join("tmp", "csrf-remix-#{Process.pid}")
    FileUtils.mkdir_p(show_dir.join("prompts"))
    show = Show.create!(slot: "csrf", track_count: 1, directory: show_dir.to_s, status: :complete)
    song = Track.create!(show: show, position: 1, title: "Cheesy", artist: "Synth",
                         audio_file: show_dir.join("01-cheesy.mp3").to_s)
    File.write(show_dir.join("01-cheesy.mp3"), "x")
    File.write(show_dir.join("prompts", "01-cheesy.prompt.json"),
               JSON.generate(payload: { caption: "test", lyrics: "[Instrumental]", bpm: 120 }))
    user = User.create!(google_uid: "g-csrf-#{Process.pid}", name: "Pat", email: "pat-csrf@example.com")
    req = user.song_requests.create!(title: "Cheesy", artist: "Synth", status: :ready, track: song)

    get admin_login_path
    post admin_login_path, params: {
      authenticity_token: response.body[/name="authenticity_token" value="([^"]+)"/, 1],
      username: "admin",
      password: "secret"
    }

    get admin_requests_path
    assert_response :success
    notes_form = response.body[%r{<form[^>]+class="rerender-form notes-form"[\s\S]*?</form>}]
    token = notes_form&.match(/name="authenticity_token" value="([^"]+)"/)&.[](1)
    assert token, "expected the notes form to carry an authenticity token"

    # The Remix button points this same form at the remix URL before submit.
    post remix_admin_track_path(song), params: {
      authenticity_token: token, request_id: req.id, inline: 1,
      instructions: "change the cheesy repetitive synth melody to vocals"
    }

    assert_redirected_to admin_requests_path
    assert_equal "Remixing Synth — Cheesy", flash[:notice]
  ensure
    FileUtils.rm_rf(show_dir) if show_dir
  end

  test "stale csrf token redirects with refresh notice instead of 422" do
    show_dir = Rails.root.join("tmp", "csrf-show-#{Process.pid}")
    FileUtils.mkdir_p(show_dir.join("prompts"))
    show = Show.create!(slot: "csrf", track_count: 1, directory: show_dir.to_s, status: :complete)
    track = Track.create!(show: show, position: 1, title: "Stale", artist: "Token",
                          audio_file: show_dir.join("01-stale.mp3").to_s)
    File.write(show_dir.join("01-stale.mp3"), "x")
    File.write(show_dir.join("prompts", "01-stale.prompt.json"),
               JSON.generate(payload: { caption: "test", lyrics: "[Instrumental]", bpm: 120 }))

    get admin_login_path
    post admin_login_path, params: {
      authenticity_token: response.body[/name="authenticity_token" value="([^"]+)"/, 1],
      username: "admin",
      password: "secret"
    }

    post remix_admin_track_path(track),
         params: { authenticity_token: "stale", instructions: "faster" },
         headers: { "HTTP_REFERER" => admin_track_url(track) }

    assert_redirected_to admin_track_url(track)
    assert_equal "This page was out of date. It has been refreshed; try again.", flash[:notice]
  ensure
    FileUtils.rm_rf(show_dir)
  end
end

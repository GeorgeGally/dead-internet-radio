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
end

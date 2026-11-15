# frozen_string_literal: true

require "test_helper"
require "active_job/test_helper"

class AdminGenerationPreviewTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  PLAN = {
    "slot" => "robot club", "show_name" => "Robot Club", "brief" => "Robots dancing under strip lights.",
    "dj_name" => "Static", "dj_announce" => "Dead Internet Radio. Robot Club. DJ Static.",
    "tracks" => [
      { "title" => "Wire Kiss", "artist" => "Neon Hex", "caption" => "electroclash, deadpan voice",
        "lyrics" => "[Verse]\nsay it", "bpm" => 128, "keyscale" => "A minor", "duration" => 200 },
      { "title" => "Club Static", "artist" => "Ohm Girls", "caption" => "electroclash, instrumental",
        "lyrics" => "[Instrumental]", "bpm" => 130, "keyscale" => "D minor", "duration" => 180 }
    ]
  }.freeze

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  teardown { ActiveJob::Base.queue_adapter = @old_queue_adapter }

  test "the form says it is working the moment it is sent" do
    get new_admin_generation_path
    assert_response :success
    assert_select "#generation-form input[type=checkbox][name=preview]"
    assert_select "#generation-form button[type=submit][data-busy-label]"
    assert_select "#generation-form .form-busy[role=status]"
  end

  test "without preview the show is sent as before" do
    assert_enqueued_with(job: GenerateShowJob) do
      post admin_generation_index_path, params: { slot: "robot club", track_count: 2 }
    end
    assert_no_enqueued_jobs(only: PlanShowJob)
    refute_predicate GenerationJob.last, :preview?
  end

  test "with preview the plan is written first and nothing is rendered" do
    assert_enqueued_with(job: PlanShowJob) do
      post admin_generation_index_path, params: { slot: "robot club", track_count: 2, preview: "1" }
    end
    assert_no_enqueued_jobs(only: GenerateShowJob)
    job = GenerationJob.last
    assert_predicate job, :awaiting_plan?
    assert_redirected_to admin_generation_path(job)

    get admin_generation_path(job)
    assert_select ".job-detail[data-live] .job-loader #p-stage", "Writing the plan"
    assert_select "#plan-form", 0
  end

  test "a written plan shows as a form to edit" do
    job = planned_job
    get admin_generation_path(job)
    assert_response :success
    assert_select ".job-detail[data-live]", 0
    assert_select "#plan-form input[name='plan[show_name]'][value='Robot Club']"
    assert_select "#plan-form textarea[name='plan[tracks][0][caption]']", "electroclash, deadpan voice"
    assert_select "#plan-form input[name='plan[tracks][1][title]'][value='Club Static']"
    assert_select "#plan-form input[name='plan[tracks][1][bpm]'][value='130']"
  end

  test "the edited plan is what is sent to the model" do
    job = planned_job
    assert_enqueued_with(job: GenerateShowJob, args: [ job.id ]) do
      patch plan_admin_generation_path(job), params: { plan: {
        show_name: "Edited Club", brief: "My brief.", dj_name: "Kode Red", dj_announce: "My words.",
        tracks: {
          "0" => { title: "New Title", artist: "Neon Hex", caption: "slow disco", lyrics: "[Verse]\r\nline one",
                   bpm: "99", keyscale: "C major", duration: "150" },
          "1" => { title: "Club Static", artist: "Ohm Girls", caption: "electroclash, instrumental",
                   lyrics: "[Instrumental]", bpm: "130", keyscale: "D minor", duration: "999" }
        }
      } }
    end
    assert_redirected_to admin_generation_path(job)

    job.reload
    assert_predicate job, :plan_confirmed?
    assert_equal "Kode Red", job.dj_name
    get progress_admin_generation_path(job)
    assert_equal "Edited Club", response.parsed_body["show_name"]
    sent = JSON.parse(GenerationLine.spec(job)[:slot].delete_prefix("plan "))
    assert_equal "Edited Club", sent["show_name"]
    assert_equal "My words.", sent["dj_announce"]
    assert_equal({ "title" => "New Title", "artist" => "Neon Hex", "caption" => "slow disco",
                   "lyrics" => "[Verse]\nline one", "bpm" => 99, "keyscale" => "C major", "duration" => 150 },
                 sent["tracks"][0])
    assert_equal 300, sent["tracks"][1]["duration"]

    patch plan_admin_generation_path(job), params: { plan: { show_name: "Again" } }
    assert_equal "Edited Club", job.reload.plan["show_name"]
  end

  test "a show waiting on its plan is never rendered" do
    job = planned_job
    GenerateShowJob.perform_now(job.id)
    assert_predicate job.reload, :pending?
    assert_nil job.options["on_pc"]
  end

  test "progress reports the stage and when it started" do
    job = GenerationJob.create!(slot: "robot club", track_count: 3, status: :pending,
                                options: { "on_pc" => true }, output_log: "Waiting for the generation PC\n")
    get progress_admin_generation_path(job)
    body = response.parsed_body
    assert_equal "Waiting for the generation PC", body["stage"]
    assert_equal job.created_at.iso8601, body["since"]
    assert_nil body["fraction"]
    assert_equal 0, body["tracks_done"]
    assert_equal [ "Track 1", "Track 2", "Track 3" ], body["planned"]
  end

  test "progress counts finished songs" do
    job = GenerationJob.create!(slot: "robot club", track_count: 2, status: :running, started_at: Time.current,
                                options: { "tracks" => { "1" => { "status" => "done" },
                                                         "2" => { "status" => "generating", "elapsed_s" => 50, "estimated_s" => 100 } } })
    get progress_admin_generation_path(job)
    assert_equal 1, response.parsed_body["tracks_done"]
    assert_in_delta 0.75, response.parsed_body["fraction"]
  end

  private

  def planned_job
    GenerationJob.create!(slot: "robot club", track_count: 2, status: :pending,
                          options: { "preview" => true, "plan" => PLAN.deep_dup, "show_name" => PLAN["show_name"] })
  end
end

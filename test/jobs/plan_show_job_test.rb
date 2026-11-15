# frozen_string_literal: true

require "test_helper"

class PlanShowJobTest < ActiveJob::TestCase
  test "the plan generate.py writes is kept on the job" do
    job = GenerationJob.create!(slot: "robot club", track_count: 2, status: :pending,
                                options: { "preview" => true, "dj_name" => "Static" })
    worker = PlanShowJob.new
    seen = nil
    stub = ->(cmd, chdir: nil, &_block) {
      seen = cmd
      File.write(cmd[cmd.index("--plan-out") + 1], { slot: "robot club", tracks: [ { title: "Wire Kiss" } ] }.to_json)
      0
    }
    with_singleton_method(worker, :run_and_stream, stub) { worker.perform(job.id) }

    job.reload
    assert_predicate job, :pending?
    assert_equal "Wire Kiss", job.plan["tracks"][0]["title"]
    assert_equal "Plan ready", job.stage
    assert_equal [ "generate.py", "robot club", "--tracks", "2" ], seen[1, 4]
    assert_includes seen, "Static"
  end

  test "a failed plan fails the job" do
    job = GenerationJob.create!(slot: "robot club", track_count: 2, status: :pending, options: { "preview" => true })
    worker = PlanShowJob.new
    with_singleton_method(worker, :run_and_stream, ->(*, **) { 1 }) { worker.perform(job.id) }

    job.reload
    assert_predicate job, :failed?
    assert_includes job.output_log, "generate.py failed with exit 1"
  end

  test "a confirmed plan is the slot generate.py is given" do
    plan = { "slot" => "robot club", "tracks" => [ { "title" => "Wire Kiss" } ] }
    job = GenerationJob.create!(slot: "robot club", track_count: 1, status: :pending,
                                options: { "preview" => true, "plan" => plan, "plan_confirmed" => true, "dry_run" => "1" })
    worker = GenerateShowJob.new
    seen = nil
    with_singleton_method(worker, :run_and_stream, ->(cmd, chdir: nil, &_b) { seen = cmd; 0 }) do
      with_singleton_method(Library, :write_taste!, -> { nil }) { worker.perform(job.id) }
    end

    assert_equal "plan #{plan.to_json}", seen[2]
    assert_predicate job.reload, :done?
  end

  private

  def with_singleton_method(receiver, name, implementation)
    singleton_class = class << receiver; self; end
    had_method = singleton_class.method_defined?(name) || singleton_class.private_method_defined?(name)
    original = singleton_class.instance_method(name) if had_method

    singleton_class.define_method(name, implementation)
    yield
  ensure
    if had_method
      singleton_class.define_method(name, original)
    else
      singleton_class.remove_method(name)
    end
  end
end

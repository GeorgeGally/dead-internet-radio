# frozen_string_literal: true

require "test_helper"

class GenerateShowJobTest < ActiveJob::TestCase
  test "failed generate command stops before remix and records the command failure" do
    generation_job = GenerationJob.create!(
      slot: "saturday afternoon disco folk",
      track_count: 4,
      status: :pending
    )

    worker = GenerateShowJob.new

    stream_stub = ->(_cmd, chdir: nil, &block) {
      block&.call("Show folder: output/saturday-afternoon-disco-folk-20260711-003935\n")
      1
    }

    with_singleton_method(worker, :run_and_stream, stream_stub) do
      with_singleton_method(AceStepManager, :acquire, -> {
        AceStepSession.create!(job_type: 'GenerateShowJob', last_activity_at: Time.current)
      }) do
        with_singleton_method(AceStepManager, :release, ->(*) { true }) do
          worker.perform(generation_job.id)
        end
      end
    end

    generation_job.reload
    assert_predicate generation_job, :failed?
    assert_includes generation_job.output_log, "generate.py failed with exit 1"
    refute_includes generation_job.output_log, "Running: djmix.py"
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

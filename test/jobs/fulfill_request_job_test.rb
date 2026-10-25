# frozen_string_literal: true

require "test_helper"

class FulfillRequestJobTest < ActiveJob::TestCase
  setup do
    user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe")
    @req = user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", status: :queued)
  end

  test "failed generate marks the request failed and releases ACE-Step" do
    worker = FulfillRequestJob.new
    released = false
    cmd_seen = nil

    with_singleton_method(worker, :run_and_stream, ->(cmd, chdir: nil, &_) { cmd_seen = cmd; 1 }) do
      with_singleton_method(AceStepManager, :acquire, -> { AceStepSession.create!(job_type: "FulfillRequestJob", last_activity_at: Time.current) }) do
        with_singleton_method(AceStepManager, :release, ->(*) { released = true }) do
          worker.perform(@req.id)
        end
      end
    end

    assert_predicate @req.reload, :failed?
    assert released
    assert_includes cmd_seen, "--request-json"
    gen_job = GenerationJob.order(:id).last
    assert_predicate gen_job, :failed?
    assert_includes gen_job.output_log, "generate.py failed with exit 1"
    refute_includes gen_job.output_log, "Running: djmix.py"
    request = JSON.parse(File.read(cmd_seen[cmd_seen.index("--request-json") + 1]))
    assert_equal "Pat", request["requester"]
  end

  test "dry run puts the request back in line" do
    worker = FulfillRequestJob.new
    with_singleton_method(worker, :run_and_stream, ->(cmd, chdir: nil, &_) { 0 }) do
      worker.perform(@req.id, dry_run: true)
    end
    assert_predicate @req.reload, :queued?
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

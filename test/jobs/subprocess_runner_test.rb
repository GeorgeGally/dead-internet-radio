# frozen_string_literal: true

require "test_helper"

class SubprocessRunnerTest < ActiveJob::TestCase
  test "signal-killed subprocess maps to 128+sig instead of nil exitstatus" do
    worker = GenerateShowJob.new
    @gen_job = GenerationJob.create!(slot: "test", status: :running)
    worker.instance_variable_set(:@gen_job, @gen_job)

    exit_status = worker.send(:run_and_stream, ["sh", "-c", "kill -TERM $$"], chdir: Dir.pwd)

    assert_equal 143, exit_status
  end

  test "normal subprocess returns real exitstatus" do
    worker = GenerateShowJob.new
    @gen_job = GenerationJob.create!(slot: "test", status: :running)
    worker.instance_variable_set(:@gen_job, @gen_job)

    exit_status = worker.send(:run_and_stream, ["true"], chdir: Dir.pwd)

    assert_equal 0, exit_status
  end
end

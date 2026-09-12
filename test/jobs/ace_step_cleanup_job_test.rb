# frozen_string_literal: true

require "test_helper"

class AceStepCleanupJobTest < ActiveJob::TestCase
  setup do
    AceStepSession.delete_all
  end

  test "purges stale sessions but keeps live ones alive" do
    AceStepSession.create!(job_type: "GenerateShowJob", last_activity_at: 20.minutes.ago)
    fresh = AceStepSession.create!(job_type: "GenerateShowJob", last_activity_at: Time.current)

    AceStepCleanupJob.new.perform

    assert_equal [fresh.id], AceStepSession.ids
  end

  test "shuts down ACE-Step when no live sessions remain" do
    AceStepSession.create!(job_type: "GenerateShowJob", last_activity_at: 20.minutes.ago)
    stopped = false
    mgr = AceStepManager.singleton_class
    mgr.send(:alias_method, :__original_stop!, :stop!)
    mgr.send(:define_method, :stop!) { stopped = true }

    AceStepCleanupJob.new.perform

    assert stopped
    assert_empty AceStepSession.all
  ensure
    mgr.send(:remove_method, :stop!)
    mgr.send(:alias_method, :stop!, :__original_stop!)
    mgr.send(:remove_method, :__original_stop!)
  end
end

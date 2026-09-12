# frozen_string_literal: true

require "test_helper"

class AceStepManagerTest < ActiveSupport::TestCase
  test "reinitialize is available to generation jobs" do
    assert_respond_to AceStepManager, :reinitialize!
  end
end

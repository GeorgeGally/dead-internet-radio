# frozen_string_literal: true

require "test_helper"

class AdminAceStepStatusTest < ActionDispatch::IntegrationTest
  setup do
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end

  test "without ACE-Step the status says the generation PC renders, and the dashboard drops the Toggle" do
    stub(AceStepManager, :installed?, false) do
      get admin_ace_step_status_path(format: :json)
      assert_response :success
      json = JSON.parse(response.body)
      assert_equal false, json["installed"]
      assert_equal GenerationLine.waiting.length, json["waiting"]

      get admin_path
      assert_response :success
      assert_select "#ace-step-toggle", count: 0
    end
  end

  test "with ACE-Step installed the status keeps its local shape and the Toggle stays" do
    stub(AceStepManager, :installed?, true) do
      get admin_ace_step_status_path(format: :json)
      assert_response :success
      json = JSON.parse(response.body)
      assert_equal true, json["installed"]
      refute json.key?("waiting")

      get admin_path
      assert_response :success
      assert_select "#ace-step-toggle", count: 1
    end
  end

  test "the generation page says the generation PC renders when ACE-Step is absent" do
    stub(AceStepManager, :installed?, false) do
      job = GenerationJob.create!(slot: "night", track_count: 2, status: :pending, options: { "on_pc" => true })
      get admin_generation_path(job)
      assert_response :success
      assert_select ".job-pc", text: "Renders on the generation PC"
    end
  end

  test "the generation page keeps its line when ACE-Step is installed" do
    stub(AceStepManager, :installed?, true) do
      job = GenerationJob.create!(slot: "night", track_count: 2, status: :pending)
      get admin_generation_path(job)
      assert_response :success
      assert_select ".job-pc", count: 0
    end
  end

  private

  # Minitest 6 has no Object#stub: swap a module method for the block.
  def stub(mod, name, value)
    original = mod.method(name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.define_singleton_method(name, original)
  end
end

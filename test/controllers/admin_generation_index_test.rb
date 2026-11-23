require "test_helper"

class AdminGenerationIndexTest < ActionDispatch::IntegrationTest
  setup do
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
    @show_job = GenerationJob.create!(slot: "night show", track_count: 10, status: :done, options: {})
    @set_job = GenerationJob.create!(slot: "late night", track_count: 0, status: :done, options: { "kind" => "set" })
  end

  test "a new generation defaults to 20 tracks" do
    get new_admin_generation_path

    assert_response :success
    assert_select "input[name='track_count'][value='20']"
  end

  test "set builds stay out of the generation list" do
    get admin_generation_index_path

    assert_response :success
    assert_select "a[href='/admin/generation/#{@show_job.id}']"
    assert_select "a[href='/admin/generation/#{@set_job.id}']", count: 0
  end
end

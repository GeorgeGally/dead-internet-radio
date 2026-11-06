require "test_helper"

class BrollIndexTest < ActionDispatch::IntegrationTest
  test "a search needs a sensible query" do
    get "/broll-index/search"
    assert_response :bad_request

    get "/broll-index/search", params: { q: "x" * 501 }
    assert_response :bad_request
  end

  test "a file list needs a real item name" do
    get "/broll-index/metadata/bad%20item"
    assert_response :bad_request
  end

  test "an archive.org failure is not kept" do
    controller = BrollIndexController
    controller.class_eval { alias_method :real_archive_json, :archive_json }
    controller.define_method(:archive_json) { |_url| raise "archive.org answered 503" }

    get "/broll-index/metadata/some-film"

    assert_response :bad_gateway
    assert_includes response.headers["Cache-Control"], "no-store"
  ensure
    controller.class_eval { alias_method :archive_json, :real_archive_json }
  end
end

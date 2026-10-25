# frozen_string_literal: true

require "test_helper"

class ApiRequestsTest < ActionDispatch::IntegrationTest
  setup do
    @old_forgery = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    @old_client_id = ENV["GOOGLE_CLIENT_ID"]
    ENV["GOOGLE_CLIENT_ID"] = "test-client"
    SongRequest.delete_all
    User.delete_all
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @old_forgery
    ENV["GOOGLE_CLIENT_ID"] = @old_client_id
  end

  test "signed out listener sees the line but cannot request" do
    get "/api/v1/me"
    me = response.parsed_body
    assert_equal false, me["signed_in"]
    assert_equal "test-client", me["google_client_id"]

    post_json "/api/v1/requests", { artist: "A", title: "B" }, me["csrf_token"]
    assert_response :unauthorized
  end

  test "writes need the csrf token and the same origin" do
    token = sign_in
    post "/api/v1/requests", params: { artist: "A", title: "B" }.to_json,
                             headers: { "Content-Type" => "application/json" }
    assert_response :forbidden

    post_json "/api/v1/requests", { artist: "A", title: "B" }, token, origin: "https://evil.example"
    assert_response :forbidden
    assert_equal 0, SongRequest.count
  end

  test "accepted request is queued and matched to a known artist" do
    show = Show.create!(slot: "test", directory: "test-#{SecureRandom.hex(4)}")
    known = Track.create!(show: show, position: 1, artist: "Static Bloom", title: "Old One")
    token = sign_in

    with_filter(RequestFilter::Result.new(true, nil)) do
      post_json "/api/v1/requests", { artist: "static bloom", title: "Carrier Signal", note: "colder" }, token
    end
    assert_response :created
    body = response.parsed_body
    assert_equal "queued", body["status"]
    assert_equal 2, body["requests_left"]
    assert_equal known.id, SongRequest.last.matched_track_id
  ensure
    show&.destroy
  end

  test "rejected request carries the station's reason and still counts" do
    token = sign_in
    post_json "/api/v1/requests", { artist: "Nazi Disco", title: "x" }, token
    body = response.parsed_body
    assert_equal "rejected", body["status"]
    assert_includes RequestFilter::NO_LINES, body["message"]
    assert_equal 2, body["requests_left"]
  end

  test "three a day" do
    token = sign_in
    with_filter(RequestFilter::Result.new(false, "No.")) do
      3.times { post_json "/api/v1/requests", { artist: "A", title: "B" }, token }
      post_json "/api/v1/requests", { artist: "A", title: "B" }, token
    end
    assert_response :too_many_requests
    assert_equal 3, SongRequest.count
  end

  private

  def sign_in
    get "/api/v1/me"
    token = response.parsed_body["csrf_token"]
    claims = { "sub" => "g-1", "email" => "pat@example.com", "name" => "Pat Doe" }
    stub(GoogleIdToken, :verify, claims) { post_json "/api/v1/session/google", { credential: "x" }, token }
    assert_response :success
    assert_equal "Pat", response.parsed_body["name"]
    response.parsed_body["csrf_token"]
  end

  def with_filter(result, &)
    stub(RequestFilter, :moderate, result, &)
  end

  # Minitest 6 has no Object#stub: swap a module method for the block.
  def stub(mod, name, value)
    original = mod.method(name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.define_singleton_method(name, original)
  end

  def post_json(path, body, token, origin: "http://www.example.com")
    post path, params: body.to_json,
               headers: { "Content-Type" => "application/json", "X-CSRF-Token" => token, "Origin" => origin }
  end
end

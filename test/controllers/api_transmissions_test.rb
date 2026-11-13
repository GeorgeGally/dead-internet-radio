require "test_helper"

class ApiTransmissionsTest < ActionDispatch::IntegrationTest
  setup do
    @old_forgery = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    Transmission.delete_all
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @old_forgery
  end

  test "any listener can read but signed-out listeners cannot send" do
    get "/api/v1/transmissions"
    assert_response :success
    get "/api/v1/me"
    post_signal({ body: "hello" }, response.parsed_body["csrf_token"])
    assert_response :unauthorized
  end

  test "signed-in message is broadcast and readable" do
    token = sign_in
    post_signal({ body: "The bass is alive" }, token)
    assert_response :created
    assert_equal "chat", response.parsed_body["kind"]
    assert_equal "The bass is alive", Transmission.last.body
    get "/api/v1/transmissions"
    assert response.parsed_body.any? { |row| row["body"] == "The bass is alive" }
  end

  test "rejects links and blocked language" do
    token = sign_in
    post_signal({ body: "visit https://example.com" }, token)
    assert_response :unprocessable_entity
    post_signal({ body: "Nazi propaganda" }, token)
    assert_response :unprocessable_entity
    assert_equal 0, Transmission.count
  end

  test "writes need csrf" do
    sign_in
    post_signal({ body: "hello" }, nil)
    assert_response :forbidden
  end

  test "anonymous heart never enters history" do
    post "/api/v1/transmissions/heart", params: "{}",
      headers: { "Content-Type" => "application/json" }
    assert_response :no_content
    assert_equal 0, Transmission.count
  end

  private

  def sign_in
    get "/api/v1/me"
    token = response.parsed_body["csrf_token"]
    claims = { "sub" => SecureRandom.hex(12), "email" => "listener@example.com", "name" => "Signal Listener" }
    stub(GoogleIdToken, :verify, claims) do
      post "/api/v1/session/google", params: { credential: "x" }.to_json,
        headers: { "Content-Type" => "application/json", "X-CSRF-Token" => token }
    end
    assert_response :success
    response.parsed_body["csrf_token"]
  end

  def stub(mod, name, value)
    old = mod.method(name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.define_singleton_method(name, old)
  end

  def post_signal(body, token)
    headers = { "Content-Type" => "application/json" }
    headers["X-CSRF-Token"] = token if token
    post "/api/v1/transmissions", params: body.to_json, headers: headers
  end
end

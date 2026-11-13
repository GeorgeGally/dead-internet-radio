require "test_helper"

class ApiTransmissionsTest < ActionDispatch::IntegrationTest
  setup do
    @old_forgery = ActionController::Base.allow_forgery_protection
    @old_key = ENV["OPENROUTER_API_KEY"]
    @old_chat = ENV["SIGNAL_CHAT_ENABLED"]
    ActionController::Base.allow_forgery_protection = true
    ENV["OPENROUTER_API_KEY"] = "test-key"
    ENV["SIGNAL_CHAT_ENABLED"] = "true"
    Rails.cache.delete(SignalControls::CACHE_KEY)
    Transmission.delete_all
  end

  teardown do
    ActionController::Base.allow_forgery_protection = @old_forgery
    ENV["OPENROUTER_API_KEY"] = @old_key
    ENV["SIGNAL_CHAT_ENABLED"] = @old_chat
    Rails.cache.delete(SignalControls::CACHE_KEY)
  end

  test "public can read visible messages, but logged-out user cannot send" do
    get "/api/v1/transmissions"
    assert_response :success
    assert response.parsed_body.key?("messages")
    assert_equal true, response.parsed_body["chat_enabled"]

    get "/api/v1/me"
    post_signal({ body: "hello" }, response.parsed_body["csrf_token"])
    assert_response :unauthorized
  end

  test "signed-in chat uses public handle and is readable" do
    token = sign_in
    user = User.last
    user.assign_signal_handle!(city: "London")
    stub(SignalFilter, :check, :allowed) do
      post_signal({ body: "The bass is alive" }, token)
    end
    assert_response :created
    assert_equal "chat", response.parsed_body["kind"]
    assert_match(/\ALondon_\d+\z/, response.parsed_body["name"])
    assert_equal "The bass is alive", Transmission.last.body
    refute_includes response.body, user.name

    get "/api/v1/transmissions"
    assert response.parsed_body["messages"].any? { |row| row["body"] == "The bass is alive" }
  end

  test "sign-in can upgrade the handle with a coarse city" do
    token = sign_in
    original = User.last.public_handle
    assert_match(/\ASomewhere_\d+\z/, original)
    post "/api/v1/signal/identity", params: { city: "London" }.to_json,
      headers: { "Content-Type" => "application/json", "X-CSRF-Token" => token }
    assert_response :success
    handle = response.parsed_body["handle"]
    assert_match(/\ALondon_\d+\z/, handle)
    refute_equal original, handle
    assert_equal handle, User.last.public_handle
  end

  test "identity endpoint requires sign-in" do
    get "/api/v1/me"
    post "/api/v1/signal/identity", params: { city: "London" }.to_json,
      headers: { "Content-Type" => "application/json", "X-CSRF-Token" => response.parsed_body["csrf_token"] }
    assert_response :unauthorized
  end

  test "moderation rejects without creating a public message" do
    token = sign_in
    stub(SignalFilter, :check, :rejected) do
      post_signal({ body: "a message rejected by the service" }, token)
    end
    assert_response :unprocessable_entity
    assert_equal 0, Transmission.count
  end

  test "model outage fails closed" do
    token = sign_in
    stub(SignalFilter, :check, :unavailable) do
      post_signal({ body: "hello world" }, token)
    end
    assert_response :service_unavailable
    assert_equal 0, Transmission.count
  end

  test "mute blocks messages and removal excludes them from catchup" do
    token = sign_in
    user = User.last
    message = Transmission.create!(kind: "chat", body: "Old transmission", user: user,
      metadata: { handle: user.public_handle })
    message.update!(hidden_at: Time.current)
    get "/api/v1/transmissions"
    assert response.parsed_body["messages"].none? { |row| row["id"] == message.id }

    user.update!(signal_muted_until: 1.hour.from_now)
    post_signal({ body: "new message" }, token)
    assert_response :forbidden
  end

  test "writes need CSRF" do
    sign_in
    post_signal({ body: "hello" }, nil)
    assert_response :forbidden
  end

  test "anonymous heart is never persisted" do
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
    original = mod.method(name)
    mod.define_singleton_method(name) { |*, **| value }
    yield
  ensure
    mod.define_singleton_method(name, original)
  end

  def post_signal(body, token)
    headers = { "Content-Type" => "application/json" }
    headers["X-CSRF-Token"] = token if token
    post "/api/v1/transmissions", params: body.to_json, headers: headers
  end
end

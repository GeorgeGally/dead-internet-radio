# frozen_string_literal: true

require "test_helper"

class ApiLooksTest < ActionDispatch::IntegrationTest
  LOOK = { "fx" => { "slots" => [[nil, false, 0.5, 0.5], ["ripple", true, 0.2, 0.8]], "focus" => 0 },
           "cutoff" => 90, "resonance" => 40, "strength" => 100 }.freeze
  OTHER = LOOK.merge("cutoff" => 200).freeze

  test "every listener reads the looks, and only an admin learns a token" do
    VisualLook.create!(artwork: "bouncy", slot: 2, settings: LOOK)

    get "/api/v1/looks"
    assert_response :success
    assert_includes response.headers["Cache-Control"], "no-store"
    assert_equal({ "looks" => { "bouncy" => { "2" => LOOK } }, "admin" => false }, response.parsed_body)

    sign_in
    get "/api/v1/looks"
    assert response.parsed_body["admin"]
    assert response.parsed_body["csrf_token"].present?
  end

  test "a listener can't save, reset or merge" do
    VisualLook.create!(artwork: "bouncy", slot: 2, settings: LOOK)

    write :put, "/api/v1/looks/bouncy/2", look: OTHER
    assert_response :forbidden
    write :delete, "/api/v1/looks/bouncy/2"
    assert_response :forbidden
    write :post, "/api/v1/looks/merge", looks: { bouncy: { 3 => OTHER } }
    assert_response :forbidden

    assert_equal({ "bouncy" => { 2 => LOOK } }, VisualLook.as_map)
  end

  test "an admin saves, overwrites and resets a slot, nulls intact" do
    sign_in

    write :put, "/api/v1/looks/bouncy/4", look: LOOK
    assert_response :success
    assert_equal LOOK, VisualLook.find_by!(artwork: "bouncy", slot: 4).settings

    write :put, "/api/v1/looks/bouncy/4", look: OTHER
    assert_equal 1, VisualLook.count
    assert_equal OTHER, VisualLook.first.settings

    write :delete, "/api/v1/looks/bouncy/4"
    assert_response :no_content
    assert_equal 0, VisualLook.count
  end

  test "bad looks are refused" do
    sign_in

    [[:put, "/api/v1/looks/bouncy/10", { look: LOOK }],
     [:put, "/api/v1/looks/bouncy/1", { look: { cutoff: 90 } }],
     [:put, "/api/v1/looks/bouncy/1", { look: { fx: "x" * 5000 } }],
     [:post, "/api/v1/looks/merge", { looks: [] }]].each do |method, path, body|
      write method, path, body
      assert_response :unprocessable_entity
    end
    assert_equal 0, VisualLook.count
  end

  test "writes must come from the station's own page" do
    sign_in
    put "/api/v1/looks/bouncy/1", params: { look: LOOK }.to_json,
                                  headers: { "Content-Type" => "application/json", "Origin" => "https://evil.example" }
    assert_response :forbidden
    assert_equal 0, VisualLook.count
  end

  test "an admin's write needs the token the looks endpoint hands out" do
    sign_in
    get "/api/v1/looks"
    token = response.parsed_body["csrf_token"]
    was = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    write :put, "/api/v1/looks/bouncy/1", look: LOOK
    assert_response :forbidden

    put "/api/v1/looks/bouncy/1", params: { look: LOOK }.to_json,
                                  headers: { "Content-Type" => "application/json", "X-CSRF-Token" => token }
    assert_response :success
  ensure
    ActionController::Base.allow_forgery_protection = was
  end

  test "merging fills the gaps and never overwrites a server look" do
    sign_in
    VisualLook.create!(artwork: "bouncy", slot: 1, settings: LOOK)
    VisualLook.create!(artwork: "full", slot: 1, settings: LOOK)
    (2..9).each { |slot| VisualLook.create!(artwork: "full", slot: slot, settings: LOOK.merge("cutoff" => slot)) }

    write :post, "/api/v1/looks/merge", looks: {
      bouncy: { 1 => OTHER, 2 => LOOK.merge("cutoff" => 3) },
      twirlz: { 5 => LOOK },
      full: { 1 => OTHER, 2 => LOOK },
    }
    assert_response :success

    body = response.parsed_body
    assert_equal [2, 1, 1, 1], body.values_at("added", "moved", "present", "left_out")
    assert_equal LOOK, body["looks"]["bouncy"]["1"], "the server's look stays in its slot"
    assert_equal OTHER, body["looks"]["bouncy"]["3"], "the clashing look moves to a free slot"
    assert_equal LOOK.merge("cutoff" => 3), body["looks"]["bouncy"]["2"]
    assert_equal LOOK, body["looks"]["twirlz"]["5"]
    assert_equal 9, body["looks"]["full"].size
  end

  test "merging twice adds nothing" do
    sign_in
    2.times { write :post, "/api/v1/looks/merge", looks: { bouncy: { 1 => LOOK } } }
    assert_equal [0, 0, 1, 0], response.parsed_body.values_at("added", "moved", "present", "left_out")
    assert_equal 1, VisualLook.count
  end

  private

  def sign_in
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
    assert_redirected_to admin_path
  end

  def write(method, path, body = {})
    send method, path, params: body.to_json, headers: { "Content-Type" => "application/json" }
  end
end

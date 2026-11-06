# frozen_string_literal: true

require "test_helper"

class AdminIdentsTest < ActionDispatch::IntegrationTest
  test "the admin lists every ident in the lab and in public/station-ids" do
    sign_in
    get admin_idents_path
    assert_response :success
    assert_select ".idents [data-ident-src]", 24
    assert_select ".idents [data-src]", Dir.glob(StationIdent::CLIPS.join("id-*.wav")).size
    assert_select ".ident-name", /ASCII · block wall/
  end

  test "every picture ident has a poster" do
    StationIdent.catalogue.select { |entry| entry[:kind] == "visual" }.each do |entry|
      assert Rails.public_path.join("labs/ident-posters/#{entry[:number]}.jpg").exist?, entry[:name]
    end
  end

  test "the retired ones start off and everything else on" do
    assert_equal (1..24).to_a - [5, 7, 11], on_air["visual"]
    assert_equal (1..14).to_a, on_air["audio"]
  end

  test "a switch saves at once and only for an admin" do
    ident = StationIdent.sync_from_player!.find { |row| row.kind == "visual" && row.number == 23 }

    patch admin_ident_path(ident), params: { station_ident: { active: false } }, as: :json
    assert_redirected_to admin_login_path
    assert ident.reload.active

    sign_in
    patch admin_ident_path(ident), params: { station_ident: { active: false } }, as: :json
    assert_response :no_content
    assert_not_includes on_air["visual"], 23
  end

  test "an audio clip switched off leaves the audio list and a row can't change kind" do
    ident = StationIdent.sync_from_player!.find { |row| row.kind == "audio" && row.number == 3 }
    sign_in
    patch admin_ident_path(ident), params: { station_ident: { active: false, kind: "visual", number: 1 } }, as: :json
    assert_response :no_content
    assert_equal %w[audio 3], ident.reload.then { |row| [row.kind, row.number.to_s] }
    assert_not_includes on_air["audio"], 3
    assert_includes on_air["visual"], 1
  end

  test "with every ident off the list is empty, and it's never cached" do
    StationIdent.sync_from_player!
    StationIdent.update_all(active: false)
    assert_equal({ "visual" => [], "audio" => [] }, on_air)
    assert_includes response.headers["Cache-Control"], "no-store"
  end

  private

  def on_air
    get "/api/v1/idents"
    assert_response :success
    response.parsed_body
  end

  def sign_in
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
    assert_redirected_to admin_path
  end
end

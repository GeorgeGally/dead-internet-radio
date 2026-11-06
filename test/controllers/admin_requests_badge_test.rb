# frozen_string_literal: true

require "test_helper"

class AdminRequestsBadgeTest < ActionDispatch::IntegrationTest
  setup do
    ENV["ADMIN_USERNAME"] = "admin"
    ENV["ADMIN_PASSWORD"] = "secret"
    SongRequest.delete_all
    @user = User.create!(google_uid: "g-#{SecureRandom.hex(4)}", name: "Pat Doe", email: "pat@example.com")
    post admin_login_path, params: { username: "admin", password: "secret" }
  end

  teardown do
    ENV.delete("ADMIN_USERNAME")
    ENV.delete("ADMIN_PASSWORD")
  end

  test "badge counts requests still on their way to a set" do
    %i[pending accepted queued generating ready rejected failed scheduled].each { |status| request_with(status) }

    get admin_requests_path

    assert_select "nav a[href='/admin/requests'] .nav-count", text: "5"
  end

  test "badge is hidden when nothing is outstanding" do
    %i[rejected failed scheduled].each { |status| request_with(status) }

    get admin_requests_path

    assert_select ".nav-count", false
  end

  private

  def request_with(status)
    @user.song_requests.create!(artist: "Static Bloom", title: "Carrier Signal", status: status)
  end
end

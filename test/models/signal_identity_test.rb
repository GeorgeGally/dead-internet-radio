require "test_helper"

class SignalIdentityTest < ActiveSupport::TestCase
  test "location handle is stable, coarse and not a Google name" do
    user = User.create!(google_uid: SecureRandom.hex(10), name: "Real Full Name")
    assert_match(/\ASomewhere_\d+\z/, user.public_handle)
    user.assign_signal_handle!(city: "New York")
    city_handle = user.public_handle
    assert_match(/\ANew_York_\d+\z/, city_handle)
    user.assign_signal_handle!(city: "Paris")
    assert_equal city_handle, user.public_handle
    refute_includes city_handle, user.first_name
  end

  test "staff names are not usable as a city" do
    assert_nil User.signal_city("ADMIN")
    assert_equal "London", User.signal_city("London")
  end

  test "request transmission uses the public handle" do
    user = User.create!(google_uid: SecureRandom.hex(10), name: "Private Person")
    user.assign_signal_handle!(city: "Berlin")
    req = user.song_requests.create!(artist: "Null Choir", title: "Static Kiss")
    req.update!(status: :accepted)
    signal = Transmission.where(kind: "request").order(:id).last
    assert_includes signal.body, user.public_handle
    refute_includes signal.body, "Private"
    assert_equal user.public_handle, req.render_spec[:requester]
  end
end

require "test_helper"

class BrollControllerTest < ActiveSupport::TestCase
  def piece_of(range) = BrollController.new.send(:piece_of, range)

  test "an open-ended range becomes one piece" do
    assert_equal "bytes=0-1048575", piece_of("bytes=0-")
    assert_equal "bytes=5000000-6048575", piece_of("bytes=5000000-")
  end

  test "a closed range goes through as asked" do
    assert_equal "bytes=0-1", piece_of("bytes=0-1")
    assert_equal "bytes=100-199", piece_of("bytes=100-199")
  end

  # archive.org item names carry dots, and file names parentheses.
  test "a film whose item name has dots reaches the proxy" do
    path = "/broll/ufo-lt.-colonel-usaf-ret.-wendelle-stevens-on-the-billy-meier-case-1979/" \
           "UFO%20-%20Lt.%20Colonel%20(USAF%20Ret.)%20Wendelle%20Stevens.mp4"
    route = Rails.application.routes.recognize_path(path)

    assert_equal "broll", route[:controller]
    assert_equal "show", route[:action]
    assert_equal "ufo-lt.-colonel-usaf-ret.-wendelle-stevens-on-the-billy-meier-case-1979", route[:item]
    assert_equal "UFO - Lt. Colonel (USAF Ret.) Wendelle Stevens.mp4", route[:file]
    assert_match BrollController::ITEM, route[:item]
    assert_match BrollController::FILE, route[:file]
  end
end

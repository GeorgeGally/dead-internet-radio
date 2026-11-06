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
end

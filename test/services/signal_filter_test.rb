require "test_helper"

class SignalFilterTest < ActiveSupport::TestCase
  setup do
    @env = ENV.to_h.slice("OPENROUTER_API_KEY", "OPENROUTER_MODEL", "SIGNAL_FILTER_MODEL")
    ENV["OPENROUTER_API_KEY"] = "test-key"
    ENV["SIGNAL_FILTER_MODEL"] = "paid/model"
    ENV["OPENROUTER_MODEL"] = "a/one:free,b/two:free"
    @calls = []
  end

  teardown do
    %w[OPENROUTER_API_KEY OPENROUTER_MODEL SIGNAL_FILTER_MODEL].each { |k| ENV[k] = @env[k] }
    SignalFilter.singleton_class.send(:remove_method, :complete) if @stubbed
  end

  # Replies are served in order; a raised one stands for an HTTP failure.
  def replies(*answers)
    calls = @calls
    @stubbed = true
    SignalFilter.define_singleton_method(:complete) do |model, _key, _text|
      calls << model
      answer = answers.shift
      raise answer if answer.is_a?(Exception)

      answer
    end
  end

  test "a fenced, chatty reply still yields its verdict" do
    replies("Sure! Here is my verdict:\n```json\n{\"allow\": true, \"redact\": []}\n```\nHope that helps {ok}")
    result = SignalFilter.check("the bass is alive")
    assert_equal :allowed, result.status
    assert_equal "the bass is alive", result.body
  end

  test "swear words are blacked out at their own length" do
    replies('{"allow":true,"redact":["fuck","shit"]}')
    result = SignalFilter.check("Fuck this, the bass is shit")
    assert_equal :allowed, result.status
    assert_equal "████ this, the bass is ████", result.body
  end

  test "a redact word only blacks out whole words" do
    replies('{"allow":true,"redact":["ass"]}')
    assert_equal "the bass is ███", SignalFilter.check("the bass is ass").body
  end

  test "abuse is rejected outright" do
    replies('{"allow":false,"redact":[]}')
    assert_equal :rejected, SignalFilter.check("you specifically are worthless").status
  end

  test "an unparseable reply is retried once on the same model" do
    replies("I cannot comply.", '{"allow":true}')
    assert_equal :allowed, SignalFilter.check("hello").status
    assert_equal ["paid/model", "paid/model"], @calls
  end

  test "after a retry fails the free models are tried in order" do
    replies("nope", "still nope", RuntimeError.new("moderation HTTP 429"), '{"allow":true}')
    assert_equal :allowed, SignalFilter.check("hello").status
    assert_equal ["paid/model", "paid/model", "a/one:free", "openrouter/free"], @calls
  end

  test "unavailable only when every model fails" do
    replies(*Array.new(6) { RuntimeError.new("moderation HTTP 500") })
    assert_equal :unavailable, SignalFilter.check("hello").status
    assert_equal ["paid/model", "a/one:free", "openrouter/free"], @calls
  end
end

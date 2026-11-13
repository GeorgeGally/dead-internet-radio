require "test_helper"

class SignalFilterTest < ActiveSupport::TestCase
  setup do
    @env = ENV.to_h.slice("OPENROUTER_API_KEY", "SIGNAL_FILTER_MODEL")
    ENV["OPENROUTER_API_KEY"] = "test-key"
    ENV["SIGNAL_FILTER_MODEL"] = "paid/model"
    @calls = []
  end

  teardown do
    %w[OPENROUTER_API_KEY SIGNAL_FILTER_MODEL].each { |k| ENV[k] = @env[k] }
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

  test "listed swearing is blacked out even when the model redacts nothing" do
    replies('{"allow":true,"redact":[]}')
    result = SignalFilter.check("FUCKING hell, this shit slaps")
    assert_equal :allowed, result.status
    assert_equal "███████ hell, this ████ slaps", result.body
  end

  test "listed swearing is blacked out when the model omits redact" do
    replies('{"allow":true}')
    assert_equal "the bass is ███", SignalFilter.check("the bass is ass").body
  end

  test "the model can black out words beyond the list" do
    replies('{"allow":true,"redact":["frak"]}')
    assert_equal "████ this, the bass is ████", SignalFilter.check("frak this, the bass is shit").body
  end

  test "swears glued into other words are blacked out" do
    replies('{"allow":true,"redact":[]}')
    assert_equal "████████ ████████ ███████████ ███████",
      SignalFilter.check("fuckface shitshow bullshitter fuckwit").body
  end

  test "goddamn, dammit and crappy are blacked out" do
    replies('{"allow":true,"redact":[]}')
    assert_equal "███████ ██████ this ██████ mix", SignalFilter.check("goddamn dammit this crappy mix").body
  end

  test "ordinary words containing a mild swear stay intact" do
    replies('{"allow":true,"redact":[]}')
    text = "class act: a peacock reading Dickens"
    assert_equal text, SignalFilter.check(text).body
  end

  test "whole-word swears and their forms are blacked out" do
    replies('{"allow":true,"redact":[]}')
    assert_equal "██████ ███████ █████ ████████ █████",
      SignalFilter.check("wanker wanking twats dickhead cunts").body
  end

  test "ordinary words that contain a swear stay intact" do
    replies('{"allow":true,"redact":[]}')
    text = "nightwatch saltwater Atwater swanky swank Scunthorpe cocked pricked cocker Dicky"
    assert_equal text, SignalFilter.check(text).body
  end

  test "an unparseable reply falls through to the free router" do
    replies("I cannot comply.", '{"allow":true,"redact":[]}')
    assert_equal :allowed, SignalFilter.check("hello").status
    assert_equal ["paid/model", "openrouter/free"], @calls
  end

  test "unavailable after two failed attempts, with no third call" do
    replies(*Array.new(3) { RuntimeError.new("moderation HTTP 500") })
    assert_equal :unavailable, SignalFilter.check("hello").status
    assert_equal ["paid/model", "openrouter/free"], @calls
  end
end

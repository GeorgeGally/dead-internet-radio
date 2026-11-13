require "test_helper"

class FictionBulletinsTest < ActiveJob::TestCase
  setup do
    @env = ENV.to_h.slice("OPENROUTER_API_KEY")
    ENV["OPENROUTER_API_KEY"] = "test-key"
    @old_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    @old_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    @calls = []
  end

  teardown do
    %w[OPENROUTER_API_KEY].each { |k| ENV[k] = @env[k] }
    Rails.cache = @old_cache
    ActiveJob::Base.queue_adapter = @old_adapter
    FictionBulletins.singleton_class.send(:remove_method, :complete) if @stubbed
  end

  def replies(*answers)
    calls = @calls
    @stubbed = true
    FictionBulletins.define_singleton_method(:complete) do |_key|
      calls << FictionBulletins::MODEL
      answer = answers.shift
      raise answer if answer.is_a?(Exception)

      answer
    end
  end

  test "only OpenRouter's free router writes the lines" do
    replies("```json\n{\"lines\":[\"The moon has been deprecated. Please migrate to the sun.\"]}\n```")
    lines = FictionBulletins.refresh!
    assert_equal [ "openrouter/free" ], @calls
    assert_equal [ "DIR FICTION / The moon has been deprecated. Please migrate to the sun." ], lines
  end

  test "lines are cleaned to one plain bulletin of at most 140 characters" do
    long = "x" * 141
    replies({ lines: [
      "DIR FICTION / **Fog** advisory\nfor Sector 2 remains in effect.",
      long, "too short", "Visit https://example.com for updates on the outage.",
      "Fog advisory for Sector 2 remains in effect."
    ] }.to_json)
    assert_equal [ "DIR FICTION / Fog advisory for Sector 2 remains in effect." ], FictionBulletins.refresh!
  end

  test "serves the built-in lines at once and refreshes in the background" do
    assert_enqueued_with(job: RefreshFictionBulletinsJob) do
      assert_equal FictionBulletins::FALLBACK, FictionBulletins.current
    end
    assert_no_enqueued_jobs { FictionBulletins.current }
  end

  test "fresh generated lines are served until they go stale" do
    replies({ lines: [ "The tide is out. The data is not coming back." ] }.to_json)
    FictionBulletins.refresh!
    assert_no_enqueued_jobs do
      assert_equal [ FictionBulletins::HAZMATS, "DIR FICTION / The tide is out. The data is not coming back." ],
        FictionBulletins.current
    end
    travel 21.minutes do
      Rails.cache.delete(FictionBulletins::LOCK_KEY)
      assert_enqueued_with(job: RefreshFictionBulletinsJob) { FictionBulletins.current }
    end
  end

  test "the hazmats warning stays in rotation and leads the model's examples" do
    assert_equal "DIR FICTION / Radiation will be heavy over the western sector this afternoon. Don’t forget those hazmats!",
      FictionBulletins::HAZMATS
    replies({ lines: [ "Acid fog expected downtown. Keep umbrellas closed and lungs open." ] }.to_json)
    FictionBulletins.refresh!
    assert_includes FictionBulletins.current, FictionBulletins::HAZMATS
    assert_includes FictionBulletins::PROMPT, "- Radiation will be heavy over the western sector"
  end

  test "a failed generation keeps the fallback and caches nothing" do
    replies(RuntimeError.new("HTTP 500"))
    assert_equal [], FictionBulletins.refresh!
    replies("not json")
    assert_equal [], FictionBulletins.refresh!
    assert_equal FictionBulletins::FALLBACK, FictionBulletins.current
  end
end

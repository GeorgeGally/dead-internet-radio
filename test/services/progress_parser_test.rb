require_relative "../test_helper"

class ProgressParserTest < Minitest::Test
  def setup
    @job = GenerationJob.create!(slot: "late-night", track_count: 5, status: :running, options: {})
  end

  def teardown
    @job.destroy!
  end

  def test_parses_show_progress
    ProgressParser.parse(@job, '[PROGRESS] {"type":"show","show_name":"Test Show","dj_name":"Void","slot":"late-night"}')
    @job.reload
    assert_equal "Test Show", @job.options["show_name"]
    assert_equal "Void", @job.options["dj_name"]
  end

  def test_parses_track_start
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_start","number":1,"total":5,"title":"Neon Pulse","artist":"Void"}')
    @job.reload
    assert_equal "generating", @job.options["tracks"]["1"]["status"]
    assert_equal 1, @job.options["current_track"]
    assert_equal 5, @job.options["total_tracks"]
  end

  def test_parses_track_progress
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_progress","number":1,"total":5,"elapsed_s":45,"estimated_s":240}')
    @job.reload
    assert_equal 45, @job.options["tracks"]["1"]["elapsed_s"]
    assert_equal 240, @job.options["tracks"]["1"]["estimated_s"]
  end

  def test_parses_track_done
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_done","number":1,"total":5,"title":"Neon Pulse","artist":"Void","file":"output/test/01-neon-pulse.mp3"}')
    @job.reload
    assert_equal "done", @job.options["tracks"]["1"]["status"]
    assert_equal "output/test/01-neon-pulse.mp3", @job.options["tracks"]["1"]["file"]
  end

  def test_parses_vo_done
    ProgressParser.parse(@job, '[PROGRESS] {"type":"vo_done","number":2,"text":"Next up is Neon Pulse","file":"output/test/02-vo.mp3"}')
    @job.reload
    assert_equal 1, @job.options["voiceovers_done"].size
    assert_equal "output/test/02-vo.mp3", @job.options["voiceovers_done"].first["file"]
  end

  def test_handles_partial_json_line
    ProgressParser.parse(@job, '[PROGRESS] {invalid')
    @job.reload
    assert_equal({}, @job.options)
  end

  def test_handles_empty_tracks_starting
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_progress","number":2,"total":5,"elapsed_s":30,"estimated_s":240}')
    @job.reload
    assert_equal 30, @job.options["tracks"]["2"]["elapsed_s"]
  end

  def test_full_transition_chain
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_start","number":1,"total":3,"title":"A","artist":"B"}')
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_progress","number":1,"total":3,"elapsed_s":30,"estimated_s":120}')
    ProgressParser.parse(@job, '[PROGRESS] {"type":"track_done","number":1,"total":3,"title":"A","artist":"B","file":"output/t/01-a.mp3"}')
    ProgressParser.parse(@job, '[PROGRESS] {"type":"complete","show_dir":"output/t","tracks":3,"total_duration_s":360}')
    @job.reload
    assert_equal "done", @job.options["tracks"]["1"]["status"]
    assert_equal "output/t/01-a.mp3", @job.options["tracks"]["1"]["file"]
    assert_equal true, @job.options["complete"]
    assert_equal "output/t", @job.options["show_dir"]
  end

  def test_ignores_non_progress_lines
    ProgressParser.parse(@job, "Show folder: output/test-show-123")
    ProgressParser.parse(@job, "5.1 Waiting for generation...")
    @job.reload
    assert_equal({}, @job.options)
  end
end

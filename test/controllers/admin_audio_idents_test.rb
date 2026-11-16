# frozen_string_literal: true

require "test_helper"

class AdminAudioIdentsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @old_queue_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
  end

  teardown { ActiveJob::Base.queue_adapter = @old_queue_adapter }

  test "a line goes to Kokoro with its voice and settings, clamped" do
    sign_in
    assert_enqueued_with(job: RenderIdentJob) do
      post admin_ident_renders_path, params: { ident_render: {
        text: "Still transmitting.", voice: "bf_emma", preview: "1",
        settings: { speed: "9", reverb: "0.3", telephone: "0" },
      } }, as: :json
    end
    assert_response :created
    take = IdentRender.find(response.parsed_body["id"])
    assert take.preview
    assert_equal({ "speed" => 1.5, "lofi" => 0.22, "reverb" => 0.3, "delay" => 0.14, "vocoder" => 0.0, "telephone" => false },
                 take.settings)
    assert_includes take.command, "--no-phone"
    assert_includes take.command, "--speed=1.5"

    get admin_ident_render_path(take), as: :json
    assert_equal "queued", response.parsed_body["status"]
  end

  test "a line starting with a dash stays bound to --text" do
    take = IdentRender.create!(text: "-40 degrees and still transmitting", voice: "bm_lewis")
    assert_includes take.command, "--text=-40 degrees and still transmitting"
  end

  test "a new preview purges previews older than an hour" do
    old = IdentRender.create!(text: "old", voice: "bm_lewis", preview: true, created_at: 2.hours.ago)
    fresh = IdentRender.create!(text: "fresh", voice: "bm_lewis", preview: true)
    IdentRender.purge_old_previews
    assert_not IdentRender.exists?(old.id)
    assert IdentRender.exists?(fresh.id)
  end

  test "an unknown voice or an empty line is refused, and only an admin may ask" do
    post admin_ident_renders_path, params: { ident_render: { text: "Hi", voice: "bm_lewis" } }, as: :json
    assert_redirected_to admin_login_path

    sign_in
    post admin_ident_renders_path, params: { ident_render: { text: "", voice: "nobody" } }, as: :json
    assert_response :unprocessable_entity
    assert_enqueued_jobs 0
  end

  test "a kept render becomes the next clip, off air, under its own words" do
    Dir.mktmpdir do |dir|
      clips = Pathname(dir)
      FileUtils.cp(StationIdent::CLIPS.join("id-14.wav"), clips.join("id-14.wav"))
      take = IdentRender.create!(text: "One frequency. One signal.", voice: "am_onyx")
      take.define_singleton_method(:command) { ["/bin/sh", "-c", "printf RIFF > #{path}"] }

      swap(StationIdent, :clips_dir, -> { clips }) do
        swap(IdentRender, :kokoro?, -> { true }) do
          swap(IdentRender, :find_by, ->(**) { take }) { RenderIdentJob.perform_now(take.id) }
        end

        assert_predicate take.reload, :done?
        clip = take.station_ident
        assert_equal ["audio", 15, false], [clip.kind, clip.number, clip.active]
        assert clips.join("id-15.wav").exist?
        assert_not_includes on_air["audio"], 15

        sign_in
        get admin_audio_idents_path
        assert_select ".ident-name", "One frequency. One signal."
        assert_select ".ident-voice", "am_onyx"

        delete admin_audio_ident_path(clip)
        assert_redirected_to admin_audio_idents_path
        assert_not clips.join("id-15.wav").exist?
        assert clip.reload.removed
        assert_equal 16, StationIdent.next_audio_number
      end
    end
  end

  test "without Kokoro a render fails and says why" do
    take = IdentRender.create!(text: "Dead air.", voice: "bm_lewis")
    swap(IdentRender, :kokoro?, -> { false }) { RenderIdentJob.perform_now(take.id) }
    assert_predicate take.reload, :failed?
    assert_match(/Kokoro isn't installed/, take.error)
  end

  test "a deleted clip leaves the list and the air" do
    clip = StationIdent.sync_from_player!.find { |row| row.kind == "audio" && row.number == 3 }
    sign_in
    delete admin_audio_ident_path(clip)
    assert StationIdent::CLIPS.join("id-03.wav").exist?, "a shipped clip's file stays"
    assert_not_includes on_air["audio"], 3
    get admin_audio_idents_path
    assert_select ".idents [data-src='/station-ids/id-03.wav']", 0
  end

  private

  def swap(receiver, name, implementation)
    original = receiver.method(name)
    receiver.define_singleton_method(name, implementation)
    yield
  ensure
    receiver.singleton_class.remove_method(name)
    receiver.define_singleton_method(name, original) unless receiver.respond_to?(name)
  end

  def on_air
    get "/api/v1/idents"
    response.parsed_body
  end

  def sign_in
    post admin_login_path, params: { username: ENV.fetch("ADMIN_USERNAME", "admin"), password: ENV.fetch("ADMIN_PASSWORD", "deadinternet") }
  end
end

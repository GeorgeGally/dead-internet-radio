# Moves a finished render onto a library song's master, keeping the old
# audio in .replaced/ — same shape as rerender.py on the server.
module RerenderApply
  class Error < StandardError; end

  def self.merge_new_audio!(song, new_audio_path, spec: nil, notes: nil)
    raise Error, "No audio for that song" unless song.audio_path&.exist?
    raise Error, "No new audio to apply" unless new_audio_path&.exist?

    src = song.audio_path
    stem = src.basename(src.extname).to_s
    stamp = Time.current.strftime("%Y%m%d-%H%M%S")
    replaced = src.dirname.join(".replaced")
    FileUtils.mkdir_p(replaced)
    FileUtils.mv(src, replaced.join("#{stem}-#{stamp}#{src.extname}"))

    log_path = src.dirname.join("prompts", "#{stem}.prompt.json")
    FileUtils.cp(log_path, replaced.join("#{stem}-#{stamp}.prompt.json")) if log_path.exist?

    FileUtils.cp(new_audio_path, src)
    new_log = new_audio_path.dirname.join("prompts", "#{new_audio_path.basename('.mp3')}.prompt.json")
    if new_log.exist?
      log = JSON.parse(File.read(new_log))
      log["rerender"] = { "at" => stamp, "notes" => notes } if notes.present?
      FileUtils.mkdir_p(log_path.dirname)
      log_path.write(JSON.pretty_generate(log))
      spec ||= log["payload"]
    end

    spec ||= {}
    duration_ms = measured_ms(src) || spec["duration"].to_i * 1000
    song.update!(
      bpm: spec["bpm"].presence || song.bpm,
      key: spec["keyscale"].presence || song.key,
      lyrics: spec["lyrics"].presence || song.lyrics,
      duration_ms: duration_ms.positive? ? duration_ms : song.duration_ms,
      mix_out_ms: MixOut.measure(src, duration_ms),
    )
    song
  end

  def self.measured_ms(path)
    out = `ffprobe -v error -show_entries format=duration -of csv=p=0 #{Shellwords.escape(path.to_s)} 2>/dev/null`
    (out.to_f * 1000).round if out.to_f.positive?
  end
  private_class_method :measured_ms
end
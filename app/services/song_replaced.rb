# Earlier renders of a library song live in <show>/.replaced/ after a
# re-render. They can be heard and switched back without a new track id.
module SongReplaced
  class Error < StandardError; end

  Entry = Struct.new(:stamp, :audio, :notes, keyword_init: true)

  def self.for_song(song)
    path = song.audio_path
    return [] unless path&.exist?

    stem = path.basename(path.extname).to_s
    dir = path.dirname.join(".replaced")
    return [] unless dir.directory?

    Dir.children(dir.to_s).filter_map do |name|
      m = name.match(/\A#{Regexp.escape(stem)}-(\d{8}-\d{6})\.mp3\z/)
      next unless m

      stamp = m[1]
      log = dir.join("#{stem}-#{stamp}.prompt.json")
      notes = log.exist? ? JSON.parse(File.read(log)).dig("rerender", "notes") : nil
      Entry.new(stamp: stamp, audio: dir.join(name), notes: notes)
    rescue JSON::ParserError
      Entry.new(stamp: stamp, audio: dir.join(name), notes: nil)
    end.sort_by(&:stamp)
  end

  def self.path(song, stamp)
    path = song.audio_path
    return unless path && stamp.match?(/\A\d{8}-\d{6}\z/)

    stem = path.basename(path.extname).to_s
    audio = path.dirname.join(".replaced", "#{stem}-#{stamp}.mp3")
    audio if audio.exist?
  end

  # Puts a .replaced take on the air as the library song; the current file
  # moves into .replaced/ so nothing is deleted.
  def self.apply!(song, stamp)
    path = song.audio_path
    raise Error, "No audio for that song" unless path&.exist?

    chosen = self.path(song, stamp)
    raise Error, "That take isn't kept anymore" unless chosen

    stem = path.basename(path.extname).to_s
    replaced = path.dirname.join(".replaced")
    FileUtils.mkdir_p(replaced)
    now = Time.current.strftime("%Y%m%d-%H%M%S")
    FileUtils.mv(path, replaced.join("#{stem}-#{now}#{path.extname}"))

    log_path = path.dirname.join("prompts", "#{stem}.prompt.json")
    if log_path.exist?
      FileUtils.cp(log_path, replaced.join("#{stem}-#{now}.prompt.json"))
    end

    chosen_log = replaced.join("#{stem}-#{stamp}.prompt.json")
    FileUtils.mv(chosen, path)
    if chosen_log.exist?
      FileUtils.mkdir_p(log_path.dirname)
      FileUtils.cp(chosen_log, log_path)
    end

    payload = song.prompt_log["payload"] || {}
    duration_ms = payload["duration"].to_i.positive? ? payload["duration"].to_i * 1000 : song.duration_ms
    song.update!(
      bpm: payload["bpm"].presence || song.bpm,
      key: payload["keyscale"].presence || song.key,
      lyrics: payload["lyrics"].presence || song.lyrics,
      duration_ms: duration_ms,
      mix_out_ms: MixOut.measure(path, duration_ms),
    )
    song
  end
end
require "open3"

# frozen_string_literal: true

module ShowImporter
  # The show as build_site.py sees it: name, DJ and tracks scanned from output/<dir>/.
  # Returns nil if the folder has no rendered tracks yet.
  def scan_show(show_dir, root)
    out, status = Open3.capture2(Rails.configuration.x.python, 'build_site.py', '--show-json', File.basename(show_dir), chdir: root)
    return nil unless status.success?

    data = JSON.parse(out)
    data['tracks'].is_a?(Array) ? data : nil
  end

  # Imports a rendered show folder as a Show with its Tracks; returns the Show.
  def import_show(show_dir, gen_job)
    root = Rails.root.to_s
    data = scan_show(show_dir, root)
    raise "No tracks found in #{show_dir}" unless data

    # Track#audio_path resolves output/<directory>/<file>, so store the bare folder name.
    show = Show.find_or_create_by!(directory: File.basename(show_dir)) do |s|
      s.slot = gen_job.slot
    end
    show.update!(
      slot: gen_job.slot,
      name: data['showName'],
      dj_name: data['djName'],
      track_count: data['tracks'].length,
      status: :complete,
      generated_at: Time.current
    )

    data['tracks'].each_with_index do |track_data, idx|
      Track.create!(
        show: show,
        position: idx + 1,
        title: track_data['title'],
        artist: track_data['artist'],
        caption: track_data['caption'],
        bpm: track_data['bpm'],
        key: track_data['key'],
        duration_ms: track_data['durationMs'],
        audio_file: track_data['file'],
        voiceover_file: track_data['voiceoverFile'],
        script: track_data['script'],
        lyrics: track_data['lyrics'],
        brief: track_data['brief']
      )
    end

    import_cues(show, root)
    import_mix_file(show, root)

    gen_job.update!(show: show)
    show
  end

  # djmix names the mix after the show's artists, not its folder, so the job
  # hands over the path djmix printed ("Done! mixes/<name>.mp3"); the cue
  # sheet sits beside it. A re-import keeps the mix it already has.
  def import_cues(show, root)
    mix = mix_output || show.mix_file
    cues_file = mix && File.join(root, mix.sub(/\.mp3\z/, '.cues.json'))
    return unless cues_file && File.exist?(cues_file)

    cues = JSON.parse(File.read(cues_file))
    cues = cues['tracks'] if cues.is_a?(Hash)
    return unless cues.is_a?(Array)

    cues.each do |cue|
      track = show.tracks.find_by(title: cue['title'], artist: cue['artist'])
      track&.update!(cue_seconds: cue['time'])
    end
  end

  def import_mix_file(show, root)
    return unless mix_output && File.exist?(File.join(root, mix_output))

    show.update!(mix_file: mix_output)
  end

  def mix_output
    @mix_output
  end
end

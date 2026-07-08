# frozen_string_literal: true

class ReimportShowJob < ApplicationJob
  include ShowImporter

  queue_as :default

  def perform(show_id)
    show = Show.find(show_id)
    return unless show.directory

    root = Rails.root.to_s
    full_path = File.join(root, show.directory)
    return unless Dir.exist?(full_path)

    playlist_path = File.join(full_path, 'playlist.json')
    return unless File.exist?(playlist_path)

    data = JSON.parse(File.read(playlist_path))
    return unless data['tracks'].is_a?(Array)

    show.update!(
      name: data['showName'] || show.name,
      dj_name: data['djName'] || show.dj_name,
      track_count: data['tracks'].length
    )

    data['tracks'].each_with_index do |track_data, idx|
      track = show.tracks.find_or_initialize_by(position: idx + 1)
      track.update!(
        title: track_data['title'],
        artist: track_data['artist'],
        caption: track_data['caption'],
        bpm: track_data['bpm'],
        key: track_data['key'],
        duration_ms: track_data['durationMs'],
        audio_file: track_data['file'],
        voiceover_file: track_data['voiceoverFile'],
        cue_seconds: track_data['cueSeconds']
      )
    end

    import_cues(show, root)
    import_mix_file(show, root)
  end
end

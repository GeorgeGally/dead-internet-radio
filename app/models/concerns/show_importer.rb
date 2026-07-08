# frozen_string_literal: true

module ShowImporter
  def import_cues(show, root)
    cues_dir = File.join(root, 'mixes')
    return unless Dir.exist?(cues_dir)

    show_basename = show.directory.split('/').last
    cues_file = Dir.glob(File.join(cues_dir, '*.cues.json'))
                   .detect { |f| f.include?(show_basename) }
    return unless cues_file

    cues = JSON.parse(File.read(cues_file))
    return unless cues.is_a?(Array)

    cues.each do |cue|
      track = show.tracks.find_by(title: cue['title'], artist: cue['artist'])
      track&.update!(cue_seconds: cue['time'])
    end
  end

  def import_mix_file(show, root)
    mix_dir = File.join(root, 'mixes')
    return unless Dir.exist?(mix_dir)

    mix_file = Dir.glob(File.join(mix_dir, '*.mp3'))
                  .select { |f| f.include?(show.directory.split('/').last) }
                  .first
    return unless mix_file

    show.update!(mix_file: mix_file.sub("#{root}/", ''))
  end
end

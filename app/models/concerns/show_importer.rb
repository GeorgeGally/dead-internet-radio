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

  def import_cues(show, root)
    cues_dir = File.join(root, 'mixes')
    return unless Dir.exist?(cues_dir)

    show_basename = show.directory.split('/').last
    cues_file = Dir.glob(File.join(cues_dir, '*.cues.json'))
                   .detect { |f| File.basename(f).start_with?(show_basename) }
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
                  .select { |f| File.basename(f).start_with?(show.directory.split('/').last) }
                  .first
    return unless mix_file

    show.update!(mix_file: mix_file.sub("#{root}/", ''))
  end
end

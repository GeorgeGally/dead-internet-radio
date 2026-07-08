namespace :import do
  desc "Import shows from static JSON manifests"
  task shows: :environment do
    root = Rails.root
    shows_path = root.join("shows.json")
    unless shows_path.exist?
      puts "No shows.json found at #{shows_path}"
      return
    end

    data = JSON.parse(shows_path.read)
    shows = data["shows"] || []
    puts "Found #{shows.length} shows to import"

    shows.each do |show_data|
      next if Show.exists?(directory: show_data["id"])

      playlist_path = root.join("dist", show_data["playlist"])
      playlist_path = root.join(show_data["playlist"]) unless playlist_path.exist?
      next unless playlist_path.exist?

      playlist = JSON.parse(playlist_path.read)
      gen_at = Time.strptime(show_data["timestamp"], "%Y%m%d-%H%M%S") rescue Time.current

      mix_file = show_data["mixFile"]
      if mix_file && !mix_file.start_with?("dist/")
        mix_file = mix_file.start_with?("audio/") ? "dist/#{mix_file}" : "dist/audio/#{mix_file}"
      end

      show = Show.create!(
        slot: show_data["id"].to_s.split("-").first(3).join(" "),
        name: show_data["name"],
        dj_name: show_data["djName"],
        track_count: show_data["trackCount"],
        directory: show_data["id"],
        mix_file: mix_file,
        status: :complete,
        generated_at: gen_at,
      )

      playlist["tracks"].each_with_index do |track_data, idx|
        Track.create!(
          show: show,
          position: idx + 1,
          title: track_data["title"],
          artist: track_data["artist"],
          caption: track_data["caption"],
          bpm: track_data["bpm"],
          key: track_data["key"],
          duration_ms: track_data["durationMs"],
          audio_file: track_data["file"],
          voiceover_file: track_data["voiceoverFile"],
          script: track_data["script"],
          lyrics: track_data["lyrics"],
          brief: track_data["brief"],
          frequency_band: track_data["frequencyBand"],
          modulation_type: track_data["modulationType"],
          signal_path: track_data["signalPath"],
        )
      end

      puts "  imported: #{show.name} (#{show.track_count} tracks)"
    end

    puts "Done. Total shows: #{Show.count}, tracks: #{Track.count}"
  end

  desc "Import visual modules from the player source"
  task visuals: :environment do
    src_dir = Rails.root.join("src/visuals")
    unless src_dir.directory?
      puts "No src/visuals directory found"
      return
    end

    js_files = Dir.glob(src_dir.join("*.js"))
    excluded = %w[engine.js filters.js gallery.js lib]
    known_names = {
      "giphy" => "Giphy Feed",
      "blocks" => "Generative Blocks",
      "grid" => "Grid",
      "trail" => "Trail",
      "isocubes" => "Iso Cubes",
      "bouncy" => "Bouncy",
      "twirlz" => "Twirlz",
      "bubbles" => "Bubbles",
      "branches" => "Branches",
      "particle_drawings" => "Particle Drawings",
      "particle_machine" => "Particle Machine",
      "four_dots" => "Four Dots",
      "delayed_lerp_points2c" => "Delayed Lerp Points 2C",
      "delayed_lerp_points8" => "Delayed Lerp Points 8",
      "delayed_lerp_points7" => "Delayed Lerp Points 7",
      "delayed_lerp_points7b" => "Delayed Lerp Points 7B",
      "delayed_lerp_points_1600" => "Delayed Lerp Points 1600",
      "patterns2" => "Patterns 2",
      "wall_drawing_26" => "Wall Drawing 26",
      "self_avoiding_walk_3d" => "Self Avoiding Walk 3D",
      "cubes_token_sha" => "Cubes Token SHA",
      "led_grid" => "LED Grid Visual",
    }

    js_files.each do |path|
      slug = File.basename(path, ".js")
      next if excluded.include?(slug)

      name = known_names[slug] || slug.humanize.titleize
      VisualModule.find_or_create_by!(slug: slug) do |v|
        v.name = name
        v.active = true
      end
    end

    puts "Done. Total visual modules: #{VisualModule.count}"
  end
end

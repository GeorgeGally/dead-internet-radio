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
    VisualModule.sync_from_player!
    puts "Done. Total visual modules: #{VisualModule.count}"
  end
end

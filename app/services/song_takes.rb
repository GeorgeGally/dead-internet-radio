# Every take of a song: what's on the library master now, kept re-renders
# in .replaced/, and each remix (and remixes of those) in the order they
# were asked for. A remix still rendering is a take without a song yet; a
# failed one is left out.
module SongTakes
  Take = Struct.new(:song, :job, :number, :replaced_stamp, :replaced_notes, :kept, keyword_init: true) do
    def original? = number.zero? && replaced_stamp.nil? && job.nil?
    def remix? = job.present?
    def rerender? = replaced_stamp.present?

    def notes = replaced_notes.presence || job&.options&.dig("instructions")

    def audio_path
      return SongReplaced.path(song, replaced_stamp) if rerender?

      song&.audio_path
    end

    def active?
      return false if job && song.nil?
      return false unless song

      live = song.audio_path
      take_audio = audio_path
      live && take_audio&.exist? && File.identical?(live, take_audio)
    end

    def in_set?(slot)
      return false unless slot.origin_track_id

      return song&.id == slot.song_id if remix?

      mine = audio_path
      held = slot.audio_path
      song.id == slot.song_id && mine&.exist? && held&.exist? && File.identical?(held, mine)
    end

    def label
      if original?
        kept ? "Current" : "Original"
      elsif rerender?
        "Earlier version"
      else
        "Remix #{number}"
      end
    end
  end

  def self.for(song)
    root = original(song)
    replaced = SongReplaced.for_song(root)
    current = Take.new(song: root, number: 0, kept: replaced.any?)
    kept = replaced.map.with_index(1) do |entry, i|
      Take.new(song: root, number: i, replaced_stamp: entry.stamp, replaced_notes: entry.notes)
    end
    remix_takes = remix_chain(root)
    remix_takes.each.with_index(1 + kept.size) { |t, i| t.number = i }
    [ current ] + kept + remix_takes
  end

  def self.remix_chain(song)
    takes = []
    queue = [ song.id ]
    seen = [ song.id ]
    while (id = queue.shift)
      remix_jobs.where("options->>'track_id' = ?", id.to_s).where.not(status: :failed).each do |job|
        take_track = job.take_track
        takes << Take.new(song: take_track, job: job)
        next if take_track.nil? || seen.include?(take_track.id)

        seen << take_track.id
        queue << take_track.id
      end
    end
    takes.sort_by { |t| t.job.created_at }
  end
  private_class_method :remix_chain

  # The song a take was remixed from, back to the first one. The job that made
  # a take names it (a remix from before takes joined their song's show is
  # still a one-song show the job names).
  def self.original(song)
    seen = [ song.id ]
    while (job = made_by(song)) &&
          (parent = Track.find_by(id: job.options["track_id"])) && !seen.include?(parent.id)
      seen << parent.id
      song = parent
    end
    song
  end

  def self.made_by(song)
    remix_jobs.find_by("options->>'take_track_id' = ?", song.id.to_s) ||
      (song.show&.kind == "remix" ? remix_jobs.find_by(show_id: song.show_id) : nil)
  end

  def self.remix_jobs
    GenerationJob.where("options->>'kind' = 'remix'").order(:created_at)
  end
  private_class_method :made_by, :remix_jobs
end

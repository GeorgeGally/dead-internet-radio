# Every take of a song: the original and each remix of it, and remixes of
# those, in the order they were asked for. A remix still rendering is a take
# without a song yet; a failed one is left out.
module SongTakes
  Take = Struct.new(:song, :job, :number, keyword_init: true) do
    def original? = number.zero?
    def notes = job&.options&.dig("instructions")
  end

  def self.for(song)
    root = original(song)
    takes = []
    queue = [ root.id ]
    seen = [ root.id ]
    while (id = queue.shift)
      remix_jobs.where("options->>'track_id' = ?", id.to_s).where.not(status: :failed).includes(show: :tracks).each do |job|
        take = job.show&.tracks&.min_by(&:position)
        takes << Take.new(song: take, job: job)
        next if take.nil? || seen.include?(take.id)

        seen << take.id
        queue << take.id
      end
    end
    takes.sort_by! { |t| t.job.created_at }
    takes.each.with_index(1) { |t, i| t.number = i }
    [ Take.new(song: root, number: 0) ] + takes
  end

  # The song a take was remixed from, back to the first one. A remix is
  # imported as a one-song show, so its show names the job that made it.
  def self.original(song)
    seen = [ song.id ]
    while (job = remix_jobs.find_by(show_id: song.show_id)) &&
          (parent = Track.find_by(id: job.options["track_id"])) && !seen.include?(parent.id)
      seen << parent.id
      song = parent
    end
    song
  end

  def self.remix_jobs
    GenerationJob.where("options->>'kind' = 'remix'").order(:created_at)
  end
  private_class_method :remix_jobs
end

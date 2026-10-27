# Keeps a fresh set waiting: builds one when no unaired set is left, or when a
# rendered request has nothing to play in. Called from Station.fill!, so it
# runs wherever the timeline does, with no scheduler.
module SetPlanner
  MINUTES = 60
  COOLDOWN = 10.minutes

  def self.tick!(at = Time.current)
    return unless needed?
    return if GenerationJob.where("options->>'kind' = 'set'")
                           .where("status IN (?) OR created_at > ?", [GenerationJob.statuses[:pending], GenerationJob.statuses[:running]], at - COOLDOWN)
                           .exists?

    build!(slot: slot_for(at + Station::HORIZON))
  end

  def self.needed?
    SongRequest.waiting_for_set.exists? ||
      !Show.airable.where(kind: "set").where.not(id: aired_show_ids).exists?
  end

  def self.build!(slot:, minutes: MINUTES, dry_run: false, no_voice: false)
    job = GenerationJob.create!(slot: slot, track_count: 0, status: :pending,
                                options: { 'kind' => 'set', 'minutes' => minutes, 'dry_run' => dry_run, 'no_voice' => no_voice })
    BuildSetJob.perform_later(job.id)
    job
  end

  # The hour sets the DJ's mood; the DJ decides the rest.
  def self.slot_for(time)
    case time.hour
    when 0..4 then "late night"
    when 5..8 then "sunrise"
    when 9..11 then "morning"
    when 12..16 then "afternoon"
    when 17..19 then "drive time"
    else "night"
    end
  end

  def self.aired_show_ids
    BroadcastSegment.joins(:track).select("tracks.show_id")
  end
end

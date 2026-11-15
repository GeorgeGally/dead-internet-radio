# The show a request or a remix belongs to. Each renders into a folder of its
# own and is imported from there as a one-song show; it then joins the show it
# belongs to and the one-song show goes. The song keeps its id, so its request,
# votes, plays and bookings stay with it, and its audio stays in the folder it
# was rendered into (Track#folder).
#
# - A request joins the show on air at its booked time, right after the song it
#   follows. Between shows it opens the next show on the timeline. With
#   neither, it stays in the library where it was rendered.
# - A remix joins its original song's show as a version of it (a take), after
#   the running order.
module SongHome
  # Segments this close are back to back (a request insert shifts both ends).
  NEAR = 1
  # A station ID or two sit between shows; the next show is a few segments on.
  LOOK_AHEAD = 12

  # Called once the request is booked: joins the show it airs in, if any.
  def self.settle_request!(track, segment)
    show, position = booked_home(segment)
    join!(track, show, position) if show
    track
  end

  # The imported take of a remix joins the original song's show. Returns that
  # show, which the job now names.
  def self.settle_take!(job, remix_show)
    take = remix_show.tracks.ordered.first
    raise "No track in #{remix_show.directory}" unless take

    song = SongTakes.original(Track.find(job.options.fetch("track_id")))
    home = song.show
    job.update!(options: job.options.merge("take_track_id" => take.id), show: home)
    join!(take, home, (home.tracks.maximum(:position) || 0) + 1, take: true)
    home
  end

  # The show on air when the segment starts and where in it the segment sits:
  # after the song it follows, or ahead of the next show's first song.
  def self.booked_home(segment)
    own = segment.track.show_id
    prev = segment
    prev = before(prev) while prev && (prev == segment || (prev.source == "request" && !in_show?(prev, own)))
    return [ prev.track.show, prev.track.position + 1 ] if prev && in_show?(prev, own)

    after = BroadcastSegment.where("starts_at >= ?", segment.starts_at).where.not(id: segment.id)
                            .where.not(source: "request").chronological.includes(track: :show).limit(LOOK_AHEAD)
                            .find { |seg| in_show?(seg, own) }
    after && [ after.track.show, after.track.position ]
  end

  # Moves the song into show at position, pushing later songs down one, and
  # drops the show it leaves once that has nothing left.
  def self.join!(track, show, position, take: false)
    from = track.show
    return track if from == show

    Track.transaction do
      show.tracks.where("position >= ?", position).order(position: :desc).each do |t|
        t.update_columns(position: t.position + 1)
      end
      track.update!(show: show, position: position, folder: track.home_folder, take: take)
      show.update!(track_count: show.tracks.running.count)
      # Found again: a preloaded from.tracks would still hold the song and
      # destroy it with the show.
      Show.find(from.id).destroy! if from && !Track.exists?(show_id: from.id)
    end
    track
  end

  # The one-song request and remix shows made before songs joined their shows,
  # folded in the same way. Returns a line per song; apply: false (a dry run)
  # rolls everything back after working it out.
  def self.fold_all!(apply: false)
    lines = []
    Track.transaction do
      Show.where(kind: "request").order(:id).includes(:tracks).each do |show|
        show.tracks.sort_by(&:position).each { |track| lines << fold_request(track) }
      end
      Show.where(kind: "remix").order(:id).each { |show| lines << fold_remix(show) }
      raise ActiveRecord::Rollback unless apply
    end
    lines
  end

  def self.fold_request(track)
    label = "request show #{track.show_id} (#{track.show.directory}) track #{track.id} #{track.artist} — #{track.title}"
    seg = BroadcastSegment.where(track_id: track.id).order(:starts_at).first
    if seg
      show, position = booked_home(seg)
      return "#{label}: stays in the library (nothing on air around #{seg.starts_at.utc.iso8601})" unless show

      join!(track, show, position)
      return "#{label}: joins show #{show.id} (#{show.name || show.slot}) at position #{position}, booked #{seg.starts_at.utc.iso8601}"
    end

    copy = Track.where(origin_track_id: track.id).joins(:show).order(:id).first
    return "#{label}: stays in the library (never booked, in no set)" unless copy
    return "#{label}: stays in the library (its copy in set #{copy.show_id} has votes of its own)" if copy.votes.exists?

    # Aired as a set's copy: the song takes the copy's place in that set.
    set, position = copy.show, copy.position
    BroadcastSegment.where(track_id: copy.id).update_all(track_id: track.id)
    copy.destroy!
    join!(track, set, position)
    "#{label}: takes its copy's place in set #{set.id} (#{set.name || set.slot}) at position #{position}"
  end

  def self.fold_remix(show)
    take = show.tracks.ordered.first
    label = "remix show #{show.id} (#{show.directory})"
    return "#{label}: empty, left alone" unless take

    job = GenerationJob.where("options->>'kind' = 'remix'").find_by(show_id: show.id)
    return "#{label}: no remix job names it, left alone" unless job && Track.exists?(job.options["track_id"])

    home = settle_take!(job, show)
    "#{label} track #{take.id}: joins show #{home.id} (#{home.name || home.slot}) as a take of track #{job.options['track_id']}"
  end

  def self.before(seg)
    BroadcastSegment.where(ends_at: (seg.starts_at - NEAR)..(seg.starts_at + NEAR)).where.not(id: seg.id)
                    .includes(track: :show).order(starts_at: :desc).first
  end

  # A song of a show or set (not a station ID between shows, not another
  # one-song request or remix show, not the song's own).
  def self.in_show?(seg, own_show_id)
    show = seg.track.show
    show.id != own_show_id && !seg.track.take && %w[interlude request remix].exclude?(show.kind)
  end

  private_class_method :fold_request, :fold_remix, :before, :in_show?
end

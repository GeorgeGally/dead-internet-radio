# frozen_string_literal: true

# One direction for a whole show: every song is rendered again with the same
# notes, then the mix is made again once the last one lands. Each song goes
# through RerenderTrackJob, so it runs here when ACE-Step is and on the
# generation PC when it is not; the batch id in every job's options is what
# ties the renders together. The last one to finish asks for the remix, so a
# show is never mixed while a track is still being written.
module ShowReedit
  module_function

  # The songs a whole-mix direction can reach: the show's running order, each
  # library song once, and only those with a prompt log to render from.
  def songs(show)
    show.tracks.running.ordered.map(&:song).uniq.select { |song| song.prompt_log["payload"].present? }
  end

  def start!(show, songs, notes)
    batch = SecureRandom.hex(6)
    songs.each do |song|
      job = GenerationJob.create!(
        slot: "rerender", track_count: 1, status: :pending,
        options: { "kind" => "rerender", "track_id" => song.id, "instructions" => notes,
                   "batch_id" => batch, "reedit_show_id" => show.id,
                   "show_name" => "#{song.artist} — #{song.title}" }.compact
      )
      RerenderTrackJob.perform_later(job.id)
    end
    batch
  end

  def batch_jobs(show, batch = nil)
    jobs = GenerationJob.where("options->>'reedit_show_id' = ?", show.id.to_s)
    batch ? jobs.where("options->>'batch_id' = ?", batch) : jobs
  end

  # A re-edit of this show is already rendering (or waiting on the PC).
  def running?(show)
    batch_jobs(show).where(status: %i[pending running]).exists?
  end

  def live_batch(show)
    batch_jobs(show).where(status: %i[pending running]).order(:id).to_a
  end

  # RemixShowJob books no kind, so this is the show's own mix while it runs.
  def live_remix(show)
    GenerationJob.where(show_id: show.id, status: %i[pending running])
                 .where("options->>'kind' IS NULL").recent.first
  end

  # Called after a track lands, locally (RerenderTrackJob) and on the PC's
  # hand-back (GenerationLine). Only the last one to finish asks for the mix.
  # The finished marker keeps two jobs finishing at once from asking twice, and
  # a track retried after a failure still gets its mix rebuilt afterwards.
  def complete!(job)
    batch = job.options&.dig("batch_id")
    show_id = job.options&.dig("reedit_show_id")
    return unless batch && show_id

    remix = false
    GenerationJob.transaction do
      jobs = GenerationJob.where("options->>'batch_id' = ?", batch)
      anchor = jobs.order(:id).lock.first
      next unless anchor
      next if jobs.where(status: %i[pending running]).exists?
      next unless jobs.where(status: :done).exists?

      last = jobs.maximum(:completed_at)
      next unless last && last.to_f > anchor.options["reedit_remixed_at"].to_f

      anchor.update!(options: anchor.options.merge("reedit_remixed_at" => last.to_f))
      remix = true
    end
    RemixShowJob.perform_later(show_id) if remix
  end

  # What the show page's progress line polls.
  def progress(show)
    latest = batch_jobs(show).order(:id).last
    return { status: "done", kind: "rerender", complete: true } unless latest

    jobs = batch_jobs(show, latest.options["batch_id"])
    total = jobs.count
    done = jobs.where(status: :done).count
    since = jobs.minimum(:created_at)&.iso8601

    if jobs.where(status: %i[pending running]).exists?
      {
        status: "running", kind: "rerender",
        stage: "Editing track #{[ done + 1, total ].min} of #{total}",
        fraction: total.zero? ? nil : done.to_f / total,
        since: since, complete: false
      }
    elsif done.positive?
      { status: "done", kind: "rerender", complete: true }
    else
      { status: "failed", kind: "rerender", since: since,
        error: "Every track failed — open a job for the details" }
    end
  end

  # Every track of the newest re-edit failed, so no mix was made.
  def failed?(show)
    latest = batch_jobs(show).order(:id).last
    return false unless latest

    jobs = batch_jobs(show, latest.options["batch_id"])
    !jobs.where(status: %i[pending running]).exists? && jobs.where(status: :done).none?
  end
end

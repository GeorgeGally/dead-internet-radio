# The generation PC's end of admin generation, called through dir-pc-gate. A
# server without ACE-Step (apps1) leaves the job pending for the PC, which takes
# it, renders it, sends the show through `import`, then marks the job done with
# its folder. Marks repeat safely: the PC retries after a drop.
module GenerationLine
  # "<id> <render spec as JSON>", one line per job waiting for the PC.
  def self.waiting
    GenerationJob.pending.where("options->>'on_pc' = 'true'").order(:id)
                 .map { |job| "#{job.id} #{spec(job).to_json}" }
  end

  def self.spec(job)
    slot = job.options&.dig('kind') == 'remix' ? "remix #{job.options.fetch('take').to_json}" : job.slot
    { slot: slot, tracks: job.track_count, dj_name: job.dj_name, crossfade: job.crossfade.to_i }.compact
  end

  def self.mark!(id, state, folder = nil)
    job = GenerationJob.find_by(id: id)
    return unless job

    job.with_lock do
      next unless job.pending? || job.running?

      case state
      when "queued" then job.update!(output_log: "Queued on the generation PC\n") if job.pending?
      when "generating" then job.update!(status: :running, started_at: Time.current, output_log: "Rendering on the generation PC\n")
      when "failed" then job.update!(status: :failed, completed_at: Time.current, output_log: "#{job.output_log}ERROR: the generation PC could not render this show\n")
      when "done"
        show = Show.find_by!(directory: folder)
        show.update!(kind: "remix") if job.options&.dig("kind") == "remix" && show.kind != "remix"
        job.update!(status: :done, completed_at: Time.current, show: show,
                    output_log: "#{job.output_log}On air: #{folder}\n")
      else raise ArgumentError, "no such state: #{state}"
      end
    end
  end
end

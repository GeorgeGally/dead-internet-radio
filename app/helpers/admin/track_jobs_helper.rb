# frozen_string_literal: true

module Admin
  module TrackJobsHelper
    EDIT_HINT = "Redoes this song with your notes. The original is kept; switch back from the set player."
    REMIX_HINT = "Adds a new version next to the original; both stay in the library."

    def pending_track_jobs_by_song
      @pending_track_jobs_by_song ||= GenerationJob.where(status: %i[pending running])
                                                   .where("options->>'kind' IN ('rerender', 'remix')")
                                                   .where("options->>'track_id' IS NOT NULL")
                                                   .order(:id)
                                                   .index_by { |j| j.options["track_id"].to_i }
    end

    def pending_track_job_for(song)
      song && pending_track_jobs_by_song[song.id]
    end
  end
end
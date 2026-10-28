# frozen_string_literal: true

module Admin
  class RequestsController < Admin::BaseController
    def index
      @requests = SongRequest.recent.includes(:user, :track, :matched_track).limit(200)
      # The render job behind each request that's being made now.
      ids = @requests.select(&:generating?).map { |r| r.id.to_s }
      # When each request's song airs next (it plays inside a set, as a copy).
      song_ids = @requests.filter_map(&:track_id)
      @airs = BroadcastSegment.joins(:track).where("broadcast_segments.ends_at > ?", Time.current)
                              .where("COALESCE(tracks.origin_track_id, tracks.id) IN (?)", song_ids.presence || [0])
                              .group("COALESCE(tracks.origin_track_id, tracks.id)").minimum(:starts_at)
      @render_jobs = GenerationJob.where("options->>'request_id' IN (?)", ids).order(:id)
                                  .index_by { |j| j.options['request_id'].to_i }
    end

    def fulfill
      req = SongRequest.find(params[:id])
      return redirect_to admin_requests_path, notice: 'Only queued requests can be rendered' unless req.queued?

      FulfillRequestJob.perform_later(req.id)
      redirect_to admin_requests_path, notice: "Rendering \"#{req.title}\" by #{req.artist}"
    end
  end
end

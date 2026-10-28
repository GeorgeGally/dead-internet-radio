# frozen_string_literal: true

module Admin
  class RequestsController < Admin::BaseController
    def index
      @requests = SongRequest.recent.includes(:user, :track, :matched_track).limit(200)
      # The render job behind each request that's being made now.
      ids = @requests.select(&:generating?).map { |r| r.id.to_s }
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

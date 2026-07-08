# frozen_string_literal: true

module Admin
  class DashboardController < Admin::BaseController
    def index
      @show_count = Show.count
      @track_count = Track.count
      @recent_jobs = GenerationJob.recent.limit(5)
      @recent_shows = Show.completed.recent.limit(5)
    end

    def build_site
      BuildSiteJob.perform_later
      redirect_to admin_generation_index_path, notice: 'Build site started'
    end
  end
end

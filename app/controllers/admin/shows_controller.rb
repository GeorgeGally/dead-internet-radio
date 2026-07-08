# frozen_string_literal: true

module Admin
  class ShowsController < Admin::BaseController
    def index
      @shows = Show.recent
    end

    def show
      @show = Show.find(params[:id])
      @tracks = @show.tracks.ordered
    end

    def destroy
      @show = Show.find(params[:id])
      @show.destroy
      redirect_to admin_shows_path, notice: 'Show deleted'
    end

    def remix
      @show = Show.find(params[:id])
      RemixShowJob.perform_later(@show.id)
      redirect_to admin_generation_index_path, notice: "Remix started for #{@show.name || @show.slot}"
    end

    def reimport
      @show = Show.find(params[:id])
      ReimportShowJob.perform_later(@show.id)
      redirect_to admin_show_path(@show), notice: 'Re-import started'
    end
  end
end

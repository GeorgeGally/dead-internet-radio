# frozen_string_literal: true

module Admin
  class ShowsController < Admin::BaseController
    def index
      @shows = Show.recent
      # Times each show has aired (its opening track started), when it last
      # did and when it's next on.
      now = Time.current
      segs = BroadcastSegment.joins(:track).group("tracks.show_id")
      @airings = segs.where("broadcast_segments.starts_at <= ?", now)
                     .where("tracks.position = (SELECT MIN(t2.position) FROM tracks t2 WHERE t2.show_id = tracks.show_id)")
                     .count
      @last_aired = segs.where("broadcast_segments.starts_at <= ?", now).maximum(:starts_at)
      @next_on = segs.where("broadcast_segments.starts_at > ?", now).minimum(:starts_at)
    end

    def show
      @show = Show.find(params[:id])
      @tracks = @show.tracks.running.ordered.includes(:origin_track)
      @mine = Vote.where(voter: Vote::ADMIN, track_id: @tracks.map(&:song_id)).pluck(:track_id, :value).to_h
      @player_sources = player_sources(@show, @tracks)
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

    private

    # The assembled mix when it is on disk; otherwise each running track that
    # has a file, in show order. Empty when there is nothing to play.
    def player_sources(show, tracks)
      mix = show.mix_path
      return [ { "src" => media_show_mix_path(show) } ] if mix && File.exist?(mix)

      tracks.filter_map do |track|
        path = track.audio_path
        next unless path && File.exist?(path)

        { "src" => media_track_path(track), "ms" => track.duration_ms.to_i, "id" => track.id }
      end
    end
  end
end

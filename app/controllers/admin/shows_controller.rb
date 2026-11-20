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
      @master_prompts = @show.generation_jobs.order(created_at: :desc).first&.master_prompts
      @reedit_batch = ShowReedit.live_batch(@show)
      @reedit_remix = ShowReedit.live_remix(@show) if @reedit_batch.empty?
      @reedit_failed = @reedit_batch.empty? && @reedit_remix.nil? && ShowReedit.failed?(@show)
    end

    def destroy
      @show = Show.find(params[:id])
      @show.destroy
      redirect_to admin_shows_path, notice: 'Show deleted'
    end

    # One direction for the whole show: every song is edited with the same
    # notes, and the mix is made again once the last one lands (ShowReedit).
    def reedit
      @show = Show.find(params[:id])
      notes = params[:instructions].to_s.strip.first(400)
      songs = ShowReedit.songs(@show)

      alert = if notes.blank?
        'Say what to change across the mix.'
      elsif songs.empty?
        'No track on this show has a prompt log to edit from.'
      elsif ShowReedit.running?(@show)
        'A re-edit of this show is already running.'
      end
      return redirect_to(admin_show_path(@show), alert: alert) if alert

      ShowReedit.start!(@show, songs, notes)
      redirect_to admin_show_path(@show),
                  notice: "Editing #{songs.size} track#{'s' unless songs.size == 1}, then the mix."
    end

    def reedit_progress
      render json: ShowReedit.progress(Show.find(params[:id]))
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

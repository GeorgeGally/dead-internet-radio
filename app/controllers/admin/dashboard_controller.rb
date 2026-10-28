# frozen_string_literal: true

module Admin
  class DashboardController < Admin::BaseController
    def index
      now = Time.current
      @on_air = BroadcastSegment.upcoming(now).includes(track: :show).first
      @song_count = Track.songs.count
      @vote_count = Vote.count
      @waiting = SongRequest.waiting_for_set.count
      @recent_shows = Show.completed.recent.limit(5)
      @recent_songs = Track.songs.includes(:show).order(id: :desc).limit(8)
      @recent_votes = Vote.includes(:track).order(updated_at: :desc).limit(8)
      @recent_requests = SongRequest.recent.includes(:user, :track).limit(6)
      @airs = BroadcastSegment.next_for(@recent_requests.filter_map(&:track_id))
      # Retried jobs count as recent: newest start first.
      @recent_jobs = GenerationJob.order(Arel.sql("COALESCE(started_at, created_at) DESC")).limit(5)
      @mine = Vote.where(voter: Vote::ADMIN, track_id: @recent_songs.map(&:id)).pluck(:track_id, :value).to_h
    end
  end
end

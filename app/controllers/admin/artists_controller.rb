# frozen_string_literal: true

module Admin
  # One band that never existed: every song by that name, how each has done
  # on air, and anything listeners asked of it.
  class ArtistsController < Admin::BaseController
    def show
      @name = params[:name]
      @songs = Track.songs.includes(:show).where("LOWER(tracks.artist) = ?", @name.downcase).order(:id).to_a
      raise ActiveRecord::RecordNotFound if @songs.empty?

      ids = @songs.map(&:id)
      aired = BroadcastSegment.joins(:track).where("broadcast_segments.starts_at <= ?", Time.current)
                              .where("COALESCE(tracks.origin_track_id, tracks.id) IN (?)", ids)
                              .group("COALESCE(tracks.origin_track_id, tracks.id)")
      @plays = aired.count
      @last_aired = aired.maximum(:starts_at)
      @mine = Vote.where(voter: Vote::ADMIN, track_id: ids).pluck(:track_id, :value).to_h
      @requests = SongRequest.includes(:user).where(track_id: ids).index_by(&:track_id)
    end
  end
end

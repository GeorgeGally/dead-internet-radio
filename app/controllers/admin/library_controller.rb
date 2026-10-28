# frozen_string_literal: true

module Admin
  # Every song the station has rendered, how it airs and how listeners take it.
  class LibraryController < Admin::BaseController
    def index
      @songs = Library.songs.order(id: :desc).to_a
      @mine = Vote.where(voter: Vote::ADMIN, track_id: @songs.map(&:id)).pluck(:track_id, :value).to_h
      # What has aired so far; Library.plays / last_aired also count bookings
      # (the set builder rests songs that are about to air).
      aired = BroadcastSegment.joins(:track).where("broadcast_segments.starts_at <= ?", Time.current)
                              .group("COALESCE(tracks.origin_track_id, tracks.id)")
      @plays = aired.count
      @last_aired = aired.maximum(:starts_at)
      @requests = SongRequest.where(track_id: @songs.map(&:id)).includes(:user).index_by(&:track_id)
      @sets = GenerationJob.where("options->>'kind' = 'set'").recent.limit(5)
    end

    # Veto is for good: the song never airs in a set again. Pressed again, it comes back.
    def veto
      song = Track.songs.find(params[:id])
      song.update!(vetoed_at: song.vetoed_at ? nil : Time.current)
      Library.write_taste!
      redirect_to admin_library_index_path, notice: "#{song.title}: #{song.vetoed_at ? 'vetoed' : 'back in the library'}"
    end

    def build
      minutes = params[:minutes].to_i.clamp(20, 240)
      slot = params[:slot].presence || SetPlanner.slot_for(Time.current)
      job = SetPlanner.build!(slot: slot, minutes: minutes)
      redirect_to admin_generation_path(job), notice: "Building a #{minutes}-minute #{slot} set"
    end
  end
end

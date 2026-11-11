# What the station says between shows: one station ID clip, kept in a show of
# kind "interlude" (build_interludes.py) and booked like any other segment so
# every listener hears it together. The ID clip switches at /admin/idents hold
# here too. The talk lines built alongside stay off air: a set change gets one
# station ID, and the show's own opening says the station's name again.
module Interlude
  STATION_ID = /station-id-(\d+)/

  # The least recently aired ID clip that's switched on; nil until
  # build_interludes.py has run.
  def self.station_id
    silenced = StationIdent.where(kind: "audio", active: false).pluck(:number)
    ids = pool.select { |track| track.audio_file.to_s.match?(STATION_ID) }
              .reject { |track| silenced.include?(track.audio_file[STATION_ID, 1].to_i) }
    aired = BroadcastSegment.group(:track_id).maximum(:starts_at)
    ids.min_by { |track| [aired[track.id] || Time.at(0), rand] }
  end

  def self.pool
    Track.joins(:show).merge(Show.completed.where(kind: "interlude")).includes(:show)
         .select { |track| track.duration_ms.to_i > 0 && track.audio_path && File.exist?(track.audio_path) }
  end
  private_class_method :pool
end

# What the station says between shows: a station ID, then a line from the DJ.
# They're short voice tracks in a show of kind "interlude" (build_interludes.py),
# booked like any other segment so every listener hears them together. The ID
# clip switches at /admin/idents hold here too.
module Interlude
  STATION_ID = /station-id-(\d+)/

  # The least recently aired ID and line; empty until build_interludes.py has run.
  def self.tracks
    ids, talk = pool.partition { |track| track.audio_file.to_s.match?(STATION_ID) }
    silenced = StationIdent.where(kind: "audio", active: false).pluck(:number)
    ids.reject! { |track| silenced.include?(track.audio_file[STATION_ID, 1].to_i) }
    aired = BroadcastSegment.group(:track_id).maximum(:starts_at)
    [ids, talk].filter_map { |group| group.min_by { |track| [aired[track.id] || Time.at(0), rand] } }
  end

  def self.pool
    Track.joins(:show).merge(Show.completed.where(kind: "interlude")).includes(:show)
         .select { |track| track.duration_ms.to_i > 0 && track.audio_path && File.exist?(track.audio_path) }
  end
  private_class_method :pool
end

module Api
  module V1
    # The shared timeline: what's on air now and what's next.
    class BroadcastController < ApplicationController
      def show
        segments = Station.lineup.map { |seg|
          t = seg.track
          {
            id: seg.id,
            trackId: t.id,
            startsAt: (seg.starts_at.to_f * 1000).round,
            durationMs: seg.duration_ms,
            source: seg.source,
            file: "/media/tracks/#{t.id}",
            voiceoverFile: t.voiceover_file.present? ? "/media/tracks/#{t.id}/voiceover" : nil,
            title: t.title,
            artist: t.artist,
            caption: t.caption,
            bpm: t.bpm,
            key: t.key,
            showName: t.show.name,
            djName: t.show.dj_name,
          }
        }
        render json: { serverTime: (Time.current.to_f * 1000).round, segments: segments }
      end
    end
  end
end

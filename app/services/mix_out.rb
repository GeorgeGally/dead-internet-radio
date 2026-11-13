require "open3"

# Where a track's sound ends. ACE-Step songs fade into seconds of near-silence,
# which the live timeline would air as dead air between tracks; the timeline
# books each track only up to here, so the next one comes straight in.
module MixOut
  QUIET = "-40dB"
  QUIET_FOR_S = 0.5
  # Let the fade finish before the next track starts.
  RING_MS = 300

  # Milliseconds into the file where its closing quiet starts; the full
  # length when it has none, or when there is no file ffmpeg can read.
  def self.measure(path, duration_ms)
    full = duration_ms.to_i
    return full unless path && File.exist?(path)

    log, status = Open3.capture2e("ffmpeg", "-hide_banner", "-nostats", "-i", path.to_s,
                                  "-af", "silencedetect=n=#{QUIET}:d=#{QUIET_FOR_S}", "-f", "null", "-")
    return full unless status.success?

    quiet_from = log.scan(/silence_start: ([\d.]+)/).flatten.last&.to_f
    quiet_to = log.scan(/silence_end: ([\d.]+)/).flatten.last&.to_f
    # Only a quiet that runs to the end of the file is a tail.
    return full unless quiet_from && (quiet_to.nil? || quiet_to < quiet_from || quiet_to * 1000 >= full - 250)

    ends = [(quiet_from * 1000 + RING_MS).round, full].min
    # A clip that is quiet from the start keeps its length.
    ends < 1000 ? full : ends
  end
end

# frozen_string_literal: true

class ProgressParser
  PROGRESS_RE = /^\[PROGRESS\]\s+(\{.+})$/

  def self.parse(gen_job, line)
    return unless (m = line.match(PROGRESS_RE))

    data = JSON.parse(m[1])
    opts = (gen_job.options || {}).deep_dup

    apply_progress(data, opts)

    gen_job.update_column(:options, opts)
  rescue JSON::ParserError
    nil
  end

  def self.apply_progress(data, opts)
    case data["type"]
    when "show"
      opts["show_name"] = data["show_name"]
      opts["dj_name"] = data["dj_name"]
    when "track_start"
      opts["tracks"] ||= {}
      opts["tracks"][data["number"].to_s] = {
        "title" => data["title"],
        "artist" => data["artist"],
        "status" => "generating"
      }
      opts["current_track"] = data["number"]
      opts["total_tracks"] = data["total"]
    when "track_done"
      opts["tracks"] ||= {}
      opts["tracks"][data["number"].to_s] = {
        "title" => data["title"],
        "artist" => data["artist"],
        "status" => "done",
        "file" => data["file"]
      }
      opts["current_track"] = data["number"]
      opts["total_tracks"] = data["total"]
    when "track_progress"
      opts["tracks"] ||= {}
      opts["tracks"][data["number"].to_s] ||= {}
      opts["tracks"][data["number"].to_s]["elapsed_s"] = data["elapsed_s"]
      opts["tracks"][data["number"].to_s]["estimated_s"] = data["estimated_s"]
      opts["current_track"] = data["number"]
      opts["total_tracks"] = data["total"]
    when "voiceovers"
      opts["voiceovers"] = data["count"]
    when "vo_done"
      opts["voiceovers_done"] ||= []
      opts["voiceovers_done"] << { "number" => data["number"], "text" => data["text"], "file" => data["file"] }
    when "complete"
      opts["complete"] = true
      opts["show_dir"] = data["show_dir"]
    end
  end

  private_class_method :apply_progress
end

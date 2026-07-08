# frozen_string_literal: true

module Admin
  class GenerationController < Admin::BaseController
    def index
      @jobs = GenerationJob.recent
    end

    def new
      @job = GenerationJob.new
    end

    def create
      @job = GenerationJob.new(
        slot: params[:slot],
        track_count: params[:track_count] || 4,
        status: :pending,
        options: {
          'dj_name' => params[:dj_name].presence,
          'crossfade' => params[:crossfade].presence,
          'dry_run' => params[:dry_run].presence
        }.compact
      )

      if @job.save
        GenerateShowJob.perform_later(@job.id)
        redirect_to admin_generation_path(@job), notice: 'Generation started'
      else
        render :new, status: :unprocessable_entity
      end
    end

    def show
      @job = GenerationJob.find(params[:id])
    end

    def progress
      job = GenerationJob.find(params[:id])
      opts = job.options || {}
      render json: {
        status: job.status,
        show_name: opts["show_name"],
        dj_name: opts["dj_name"],
        tracks: opts["tracks"] || {},
        current_track: opts["current_track"],
        total_tracks: opts["total_tracks"],
        voiceovers: opts["voiceovers"],
        voiceovers_done: opts["voiceovers_done"] || [],
        complete: opts["complete"],
        show_dir: opts["show_dir"],
      }
    end

    def output
      path = File.absolute_path(File.join(Rails.root, params[:file_path]))
      return head :forbidden unless path.start_with?(Rails.root.to_s)

      if File.exist?(path)
        ext = File.extname(path).downcase
        mime = case ext
               when ".mp3" then "audio/mpeg"
               when ".wav" then "audio/wav"
               else "application/octet-stream"
               end
        send_file path, type: mime, disposition: "inline"
      else
        head :not_found
      end
    end
  end
end

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

    def retry
      @job = GenerationJob.find(params[:id])
      if @job.failed? || (@job.running? && @job.started_at < 1.hour.ago)
        @job.update!(status: :pending, started_at: nil, completed_at: nil, output_log: nil)
        GenerateShowJob.perform_later(@job.id)
        redirect_to admin_generation_path(@job), notice: 'Generation restarted (resuming from existing state)'
      elsif @job.running?
        redirect_to admin_generation_path(@job), alert: 'Job is still running'
      else
        redirect_to admin_generation_path(@job), alert: 'Can only retry failed jobs'
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
      root = "#{Rails.root}/"
      path = File.absolute_path(File.join(root, params[:file_path]))
      return head :forbidden unless path.start_with?(root)

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

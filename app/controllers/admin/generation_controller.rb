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
  end
end

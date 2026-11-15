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
        track_count: params[:track_count].presence || 10,
        status: :pending,
        options: {
          'dj_name' => params[:dj_name].presence,
          'crossfade' => params[:crossfade].presence,
          'dry_run' => params[:dry_run].presence,
          'preview' => (true if params[:preview] == '1')
        }.compact
      )

      if @job.save
        if @job.preview?
          PlanShowJob.perform_later(@job.id)
          redirect_to admin_generation_path(@job), notice: 'Writing the plan'
        else
          GenerateShowJob.perform_later(@job.id)
          redirect_to admin_generation_path(@job), notice: 'Generation started'
        end
      else
        render :new, status: :unprocessable_entity
      end
    end

    def retry
      @job = GenerationJob.find(params[:id])
      if @job.failed? || (@job.running? && @job.started_at < 1.hour.ago)
        options = @job.options || {}
        options = options.except('on_pc', 'take') if options['kind'].in?(%w[remix rerender])
        @job.update!(status: :pending, started_at: nil, completed_at: nil, output_log: nil, options: options)
        next_job = @job.awaiting_plan? ? PlanShowJob : GenerateShowJob
        { 'set' => BuildSetJob, 'rerender' => RerenderTrackJob, 'remix' => RerenderTrackJob }.fetch(@job.options&.dig('kind'), next_job).perform_later(@job.id)
        redirect_to admin_generation_path(@job), notice: 'Generation restarted (resuming from existing state)'
      elsif @job.running?
        redirect_to admin_generation_path(@job), alert: 'Job is still running'
      else
        redirect_to admin_generation_path(@job), alert: 'Can only retry failed jobs'
      end
    end

    def show
      @job = GenerationJob.find(params[:id])
      rerender_review if @job.options&.dig('kind') == 'rerender'
    end

    # The edited plan, confirmed: the show is made from exactly these values.
    def plan
      @job = GenerationJob.find(params[:id])
      unless @job.pending? && @job.awaiting_plan? && @job.plan.present?
        return redirect_to admin_generation_path(@job), alert: 'This plan has already been sent'
      end

      plan = edited_plan(@job)
      @job.update!(track_count: plan['tracks'].size,
                   options: @job.options.merge('plan' => plan, 'plan_confirmed' => true,
                                               'show_name' => plan['show_name'].presence,
                                               'dj_name' => plan['dj_name'].presence).compact)
      GenerateShowJob.perform_later(@job.id)
      redirect_to admin_generation_path(@job), notice: 'Generation started'
    end

    def progress
      job = GenerationJob.find(params[:id])
      opts = job.options || {}
      render json: {
        status: job.status,
        kind: opts["kind"],
        error: job.failed? ? job.output_log.to_s.lines.map(&:strip).reject(&:empty?).last : nil,
        stage: job.stage,
        plan_ready: job.awaiting_plan? && job.plan.present?,
        since: (job.started_at || job.created_at)&.iso8601,
        fraction: job.fraction,
        tracks_done: job.tracks_done,
        planned: (1..job.total_tracks.to_i).map { |i| job.planned_title(i) },
        show_name: opts["show_name"],
        dj_name: opts["dj_name"],
        tracks: opts["tracks"] || {},
        current_track: opts["current_track"],
        total_tracks: job.total_tracks,
        voiceovers: opts["voiceovers"],
        voiceovers_done: opts["voiceovers_done"] || [],
        complete: opts["complete"],
        show_dir: opts["show_dir"],
        log: job.output_log.to_s.last(20_000),
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

    private

    PLAN_TEXT = %w[show_name brief dj_name dj_announce].freeze
    SONG_TEXT = %w[title artist caption lyrics keyscale].freeze
    # The generation PC's GPU runs out of memory past this (generate.py MAX_TRACK_SECONDS).
    MAX_SECONDS = 300

    # The plan as written, with the admin's edits in place. Songs are the ones the
    # plan already has; only their values change.
    def edited_plan(job)
      edits = params.fetch(:plan, {})
      plan = job.plan.merge(PLAN_TEXT.index_with { |key| text(edits[key], job.plan[key]) })
      plan['tracks'] = job.plan['tracks'].each_with_index.map do |song, i|
        edit = edits.dig(:tracks, i.to_s) || {}
        song.merge(SONG_TEXT.index_with { |key| text(edit[key], song[key]) })
            .merge('bpm' => number(edit[:bpm], song['bpm']),
                   'duration' => number(edit[:duration], song['duration'])&.clamp(30, MAX_SECONDS))
      end
      plan
    end

    def text(value, fallback)
      value.nil? ? fallback : value.to_s.gsub("\r\n", "\n").strip
    end

    def number(value, fallback)
      value.present? ? value.to_i : fallback
    end

    # Before and after for a re-render: what the producer said went wrong and
    # what it changed. Jobs from before it said so fall back to the prompt logs.
    def rerender_review
      @track = Track.find_by(id: @job.options['track_id'])
      @review = (@job.options['review'] || {}).dup
      return unless @track

      log = @track.prompt_log
      if @job.done?
        @review['after'] ||= log['payload']
        @review['before'] ||= replaced_payload(@track)
      else
        @review['before'] ||= log['payload']
      end
    end

    def replaced_payload(track)
      return unless track.audio_path

      stem = track.audio_path.basename('.mp3').to_s
      path = Dir[track.audio_path.dirname.join('.replaced', "#{stem}-*.prompt.json").to_s].max
      path && JSON.parse(File.read(path))['payload']
    rescue JSON::ParserError
      nil
    end
  end
end

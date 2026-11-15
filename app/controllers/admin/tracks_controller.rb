# frozen_string_literal: true

module Admin
  class TracksController < Admin::BaseController
    # One song: hear it, read what it was made from, say what's wrong and
    # render it again. A set's copy shows its library song.
    def show
      track = Track.find(params[:id])
      @song = track.song
      @log = @song.prompt_log
      @payload = @log['payload'] || {}
      @appears = Track.where(id: @song.id).or(Track.where(origin_track_id: @song.id)).includes(:show).map(&:show).compact.uniq
      @plays = BroadcastSegment.joins(:track).where('broadcast_segments.starts_at <= ?', Time.current)
                               .where('COALESCE(tracks.origin_track_id, tracks.id) = ?', @song.id)
      @mine = Vote.find_by(voter: Vote::ADMIN, track_id: @song.id)&.value
      @rerenders = GenerationJob.where("options->>'kind' IN ('rerender', 'remix') AND options->>'track_id' = ?", @song.id.to_s)
                                .includes(show: :tracks).recent
      @request = SongRequest.includes(:user).find_by(track_id: @song.id)
    end

    # Library songs that could take this set slot: closest tempo first, or a search.
    def swap_options
      @track = Track.find(params[:id])
      @songs = SetSwap.candidates(@track, query: params[:q])
      render partial: 'swap_options'
    end

    # From the set player, the chosen take goes in and the mix is made again.
    def swap
      track = Track.find(params[:id])
      notice = if params[:replaced].present?
        song = track.song
        in_set = track.origin_track_id && track.show&.kind == "set"
        SetSwap.ensure_off_air!(track) if in_set
        SongReplaced.apply!(song, params[:replaced].to_s)
        SetSwap.resync!(track) if in_set
        "Using #{song.reload.artist} — #{song.title}"
      else
        SetSwap.swap!(track, Track.find(params[:song_id]))
        "Swapped in #{track.reload.artist} — #{track.title}"
      end
      RemixShowJob.perform_later(track.show_id) if params[:remix].present?
      notice += ". Remixing the set." if params[:remix].present?
      redirect_to back_path || admin_show_path(track.show), notice: notice
    rescue SetSwap::Error, SongReplaced::Error => e
      redirect_to back_path || admin_show_path(track.show), alert: e.message
    end

    def destroy
      @track = Track.find(params[:id])
      show = @track.show
      remove_audio_files(@track)
      @track.destroy
      show.update!(track_count: show.tracks.running.count) if show
      redirect_to admin_show_path(show), notice: "Track '#{@track.title}' removed from show — click Remix to rebuild the mix"
    end

    # Render the song again with notes. A set's track points at its library
    # song, so the song is what gets re-rendered.
    def rerender
      track = Track.find(params[:id])
      song = track.song
      notes = params[:instructions].to_s.strip
      return redirect_back(fallback_location: admin_show_path(track.show), alert: 'Say what to change.') if notes.blank?

      job = GenerationJob.create!(slot: 'rerender', track_count: 1, status: :pending,
                                  options: { 'kind' => 'rerender', 'track_id' => song.id, 'instructions' => notes,
                                             'request_id' => params[:request_id].presence,
                                             'show_name' => "#{song.artist} — #{song.title}" }.compact)
      RerenderTrackJob.perform_later(job.id)
      if params[:inline].present?
        return redirect_to admin_requests_path, notice: "Editing #{song.artist} — #{song.title}"
      end

      redirect_to admin_generation_path(job)
    end

    # A new take of the song: same sound, lyrics, tempo, key and length, a new
    # render as a song of its own, revised first when the admin gives it a
    # direction. The original stays as it is.
    def remix
      song = Track.find(params[:id]).song
      return redirect_to admin_track_path(song), alert: 'No prompt log to remix from.' if song.prompt_log['payload'].blank?

      job = GenerationJob.create!(slot: 'remix', track_count: 1, status: :pending,
                                  options: { 'kind' => 'remix', 'track_id' => song.id,
                                             'instructions' => params[:instructions].to_s.strip.first(400).presence,
                                             'request_id' => params[:request_id].presence,
                                             'show_name' => "#{song.artist} — #{song.title}" }.compact)
      RerenderTrackJob.perform_later(job.id)
      if params[:inline].present?
        return redirect_to admin_requests_path, notice: "Remixing #{song.artist} — #{song.title}"
      end

      redirect_to back_path || admin_track_path(song), notice: "Remixing #{song.artist} — #{song.title}"
    end

    # The station's own like: a vote from "admin" on the song, counted with
    # the listeners' and read by the songwriter like theirs. 0 takes it back.
    def like
      song = Track.find(params[:id]).song
      return head :unprocessable_entity unless song.votable?

      song = Vote.cast!(song, Vote::ADMIN, params[:value].to_i.clamp(-1, 1))
      render json: { up: song.up_votes, down: song.down_votes, mine: song.votes.find_by(voter: Vote::ADMIN)&.value.to_i }
    end

    private

    # Where a form on another admin page asked to come back to.
    def back_path
      back = params[:back].to_s
      back if back.start_with?("/admin/") && !back.start_with?("//")
    end

    # Moves audio + voiceover files into <show_dir>/.removed/ rather than deleting,
    # so djmix.py (which globs *.mp3 at the top level) skips them but recovery is possible.
    def remove_audio_files(track)
      # A request or remix that joined this show keeps its audio in its own folder.
      return if show_directory_blank?(track) || track.folder.present?

      # expand_path handles both relative ("output/show-…") and absolute directories
      show_dir = File.expand_path(track.show.directory, Rails.root)
      removed_dir = File.join(show_dir, ".removed")
      FileUtils.mkdir_p(removed_dir)
      prefix = format("%02d", track.position)
      Dir.children(show_dir).each do |name|
        next unless name.start_with?("#{prefix}-")

        FileUtils.mv(File.join(show_dir, name), File.join(removed_dir, name))
      end
    end

    def show_directory_blank?(track)
      track.show.nil? || track.show.directory.blank?
    end
  end
end

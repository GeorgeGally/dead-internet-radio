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
      @rerenders = GenerationJob.where("options->>'kind' = 'rerender' AND options->>'track_id' = ?", @song.id.to_s).recent
      @request = SongRequest.includes(:user).find_by(track_id: @song.id)
    end

    def destroy
      @track = Track.find(params[:id])
      show = @track.show
      remove_audio_files(@track)
      @track.destroy
      show.update!(track_count: show.tracks.count) if show
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
                                             'show_name' => "#{song.artist} — #{song.title}" })
      RerenderTrackJob.perform_later(job.id)
      redirect_to admin_generation_path(job)
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

    # Moves audio + voiceover files into <show_dir>/.removed/ rather than deleting,
    # so djmix.py (which globs *.mp3 at the top level) skips them but recovery is possible.
    def remove_audio_files(track)
      return if show_directory_blank?(track)

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

# frozen_string_literal: true

module Admin
  class TracksController < Admin::BaseController
    def destroy
      @track = Track.find(params[:id])
      show = @track.show
      remove_audio_files(@track)
      @track.destroy
      show.update!(track_count: show.tracks.count) if show
      redirect_to admin_show_path(show), notice: "Track '#{@track.title}' removed from show — click Remix to rebuild the mix"
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

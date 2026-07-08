class AddCueSecondsToTracks < ActiveRecord::Migration[8.0]
  def change
    add_column :tracks, :cue_seconds, :float
  end
end

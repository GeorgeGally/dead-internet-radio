# The station's own vote on a song (the admin's: -1, 0 or 1), kept on the song
# beside the listener counters so the set builder and the clock read it cheaply.
class AddStationVoteToTracks < ActiveRecord::Migration[8.0]
  def up
    add_column :tracks, :station_vote, :integer, default: 0, null: false
    execute <<~SQL
      UPDATE tracks SET station_vote = votes.value
      FROM votes WHERE votes.track_id = tracks.id AND votes.voter = 'admin'
    SQL
  end

  def down
    remove_column :tracks, :station_vote
  end
end

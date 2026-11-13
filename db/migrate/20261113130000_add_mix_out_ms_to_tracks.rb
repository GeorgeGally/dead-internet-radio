class AddMixOutMsToTracks < ActiveRecord::Migration[8.0]
  def change
    add_column :tracks, :mix_out_ms, :integer
  end
end

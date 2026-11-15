class AddIdeaToTracks < ActiveRecord::Migration[8.0]
  def change
    add_column :tracks, :idea, :text
  end
end

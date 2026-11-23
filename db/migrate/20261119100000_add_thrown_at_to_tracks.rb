# A thrown remix take leaves the library and the rotation, but the row and its
# audio stay on disk so it can be kept again.
class AddThrownAtToTracks < ActiveRecord::Migration[8.0]
  def change
    add_column :tracks, :thrown_at, :datetime
  end
end

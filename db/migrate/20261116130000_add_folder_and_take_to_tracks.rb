# A request or a remix joins the show it belongs to instead of standing as a
# one-song show. Its audio stays in the folder it was rendered into (folder),
# and a remix sits in the original song's show as a version of it (take), out
# of the running order.
class AddFolderAndTakeToTracks < ActiveRecord::Migration[8.0]
  def change
    add_column :tracks, :folder, :string
    add_column :tracks, :take, :boolean, default: false, null: false
  end
end

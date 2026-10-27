# The track library: songs are reused across sets, so a set's track points
# back at the song it plays (origin_track_id). Votes and vetoes live on the song.
class CreateLibrary < ActiveRecord::Migration[8.0]
  def change
    add_reference :tracks, :origin_track, foreign_key: { to_table: :tracks, on_delete: :nullify }
    add_column :tracks, :up_votes, :integer, default: 0, null: false
    add_column :tracks, :down_votes, :integer, default: 0, null: false
    add_column :tracks, :vetoed_at, :datetime

    # show: rendered by generate.py; set: built from the library; request: a
    # rendered request that only airs inside a set.
    add_column :shows, :kind, :string, default: "show", null: false
    add_index :shows, :kind

    create_table :votes do |t|
      t.references :track, null: false, foreign_key: { on_delete: :cascade }
      t.string :voter, null: false
      t.integer :value, null: false
      t.timestamps
    end
    add_index :votes, [:track_id, :voter], unique: true

    add_column :song_requests, :time_zone, :string
    add_column :song_requests, :notified_at, :datetime

    reversible do |dir|
      dir.up { execute "UPDATE shows SET kind = 'request' WHERE slot = 'request line'" }
    end
  end
end

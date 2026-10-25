class CreateUsersAndSongRequests < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :google_uid, null: false
      t.string :email
      t.string :name
      t.timestamps
    end
    add_index :users, :google_uid, unique: true

    create_table :song_requests do |t|
      t.references :user, null: false, foreign_key: true
      t.string :artist, null: false
      t.string :title, null: false
      t.string :note
      t.integer :status, null: false, default: 0
      t.string :rejection_reason
      t.references :matched_track, foreign_key: { to_table: :tracks, on_delete: :nullify }
      t.references :track, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :song_requests, [:user_id, :created_at]
    add_index :song_requests, :status
  end
end

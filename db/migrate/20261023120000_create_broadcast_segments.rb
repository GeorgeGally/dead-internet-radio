class CreateBroadcastSegments < ActiveRecord::Migration[8.0]
  def change
    create_table :broadcast_segments do |t|
      t.references :track, null: false, foreign_key: true
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.string :source, null: false, default: "rotation"
      t.timestamps
    end
    add_index :broadcast_segments, :starts_at
    add_index :broadcast_segments, :ends_at
  end
end

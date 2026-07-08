class CreateShows < ActiveRecord::Migration[8.0]
  def change
    create_table :shows do |t|
      t.string :slot, null: false
      t.string :name
      t.string :dj_name
      t.integer :track_count, default: 4
      t.string :directory
      t.string :mix_file
      t.integer :status, default: 0
      t.datetime :generated_at

      t.timestamps
    end

    add_index :shows, :directory, unique: true
    add_index :shows, :status
  end
end

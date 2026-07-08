class CreateTracks < ActiveRecord::Migration[8.0]
  def change
    create_table :tracks do |t|
      t.references :show, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :title
      t.string :artist
      t.text :caption
      t.integer :bpm
      t.string :key
      t.integer :duration_ms
      t.string :audio_file
      t.string :voiceover_file
      t.text :script
      t.text :lyrics
      t.text :brief
      t.string :frequency_band
      t.string :modulation_type
      t.string :signal_path
      t.string :artwork_url

      t.timestamps
    end

    add_index :tracks, [:show_id, :position], unique: true
  end
end

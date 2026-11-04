class CreateVisualLooks < ActiveRecord::Migration[8.0]
  def change
    create_table :visual_looks do |t|
      t.string :artwork, null: false
      t.integer :slot, null: false
      t.jsonb :settings, null: false, default: {}
      t.timestamps
      t.index %i[artwork slot], unique: true
    end
  end
end

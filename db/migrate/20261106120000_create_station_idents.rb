class CreateStationIdents < ActiveRecord::Migration[8.0]
  def change
    create_table :station_idents do |t|
      t.string :kind, null: false
      t.integer :number, null: false
      t.boolean :active, null: false, default: true
      t.timestamps
      t.index %i[kind number], unique: true
    end
  end
end

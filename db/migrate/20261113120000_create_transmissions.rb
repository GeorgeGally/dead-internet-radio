class CreateTransmissions < ActiveRecord::Migration[8.0]
  def change
    create_table :transmissions do |t|
      t.references :user, foreign_key: true
      t.string :kind, null: false
      t.string :body, null: false, limit: 240
      t.jsonb :metadata, null: false, default: {}
      t.timestamps
    end
    add_index :transmissions, :created_at
    add_index :transmissions, [:user_id, :created_at]
  end
end

class AddSignalModerationAndHandles < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :signal_handle, :string
    add_column :users, :signal_muted_until, :datetime
    add_index :users, :signal_handle, unique: true

    add_column :transmissions, :hidden_at, :datetime
    add_index :transmissions, :hidden_at
  end
end

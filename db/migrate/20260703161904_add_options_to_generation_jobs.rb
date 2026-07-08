class AddOptionsToGenerationJobs < ActiveRecord::Migration[8.0]
  def change
    add_column :generation_jobs, :options, :jsonb
  end
end

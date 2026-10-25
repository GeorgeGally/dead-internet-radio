namespace :requests do
  desc "Render queued listener requests one at a time (local only, needs ACE-Step). DRY_RUN=1 writes prompts only, LIMIT=n stops early."
  task fulfill: :environment do
    dry_run = ENV["DRY_RUN"] == "1"
    queued = SongRequest.queued.order(:created_at)
    queued = queued.limit(ENV["LIMIT"].to_i) if ENV["LIMIT"].present?
    puts "#{queued.count} queued request(s)"

    queued.each do |req|
      puts "##{req.id} \"#{req.title}\" by #{req.artist}"
      FulfillRequestJob.perform_now(req.id, dry_run: dry_run)
      puts "  -> #{req.reload.status}"
    end
  end
end

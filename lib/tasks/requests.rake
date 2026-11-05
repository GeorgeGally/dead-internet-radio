namespace :requests do
  desc "Render accepted listener requests one at a time (local only, needs ACE-Step). DRY_RUN=1 writes prompts only, LIMIT=n stops early."
  task fulfill: :environment do
    dry_run = ENV["DRY_RUN"] == "1"
    waiting = SongRequest.accepted.order(:created_at)
    waiting = waiting.limit(ENV["LIMIT"].to_i) if ENV["LIMIT"].present?
    puts "#{waiting.count} accepted request(s)"

    waiting.each do |req|
      puts "##{req.id} \"#{req.title}\" by #{req.artist}"
      FulfillRequestJob.perform_now(req.id, dry_run: dry_run)
      puts "  -> #{req.reload.status}"
    end
  end
end

class RefreshFictionBulletinsJob < ApplicationJob
  queue_as :default

  def perform
    FictionBulletins.refresh!
  end
end

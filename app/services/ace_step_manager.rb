require 'net/http'
require 'open3'

class AceStepManager
  class StartupError < StandardError; end

  ACE_STEP_DIR = Rails.root.join('ACE-Step-1.5').freeze
  HEALTH_PATH = '/health'
  STARTUP_TIMEOUT = 120
  HEALTH_POLL_INTERVAL = 2
  HEALTH_TIMEOUT = 3
  IDLE_TIMEOUT = 60

  class << self
    def healthy?
      uri = URI(ace_step_url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = HEALTH_TIMEOUT
      http.read_timeout = HEALTH_TIMEOUT
      resp = http.get(HEALTH_PATH)
      resp.is_a?(Net::HTTPOK) || resp.is_a?(Net::HTTPNoContent)
    rescue Errno::ECONNREFUSED, Errno::ECONNRESET, Net::OpenTimeout, Net::ReadTimeout, Errno::EADDRNOTAVAIL
      false
    end

    def start!
      return true if healthy?

      start_cmd = startup_command
      Rails.logger.info "[AceStepManager] Starting ACE-Step: #{start_cmd}"

      pid = spawn_process(start_cmd)
      cache_pid(pid)

      wait_for_healthy
      Rails.logger.info "[AceStepManager] ACE-Step started (PID #{pid})"
      true
    rescue StartupError => e
      Rails.logger.error "[AceStepManager] Failed to start ACE-Step: #{e.message}"
      clear_pid
      raise
    end

    def acquire
      start! unless healthy?

      session = AceStepSession.create!(
        job_type: 'GenerateShowJob',
        last_activity_at: Time.current
      )
      Rails.logger.info "[AceStepManager] Acquired session ##{session.id}"
      session
    end

    def release(session)
      session&.destroy!
      Rails.logger.info "[AceStepManager] Released session ##{session&.id}"
      AceStepCleanupJob.set(wait: IDLE_TIMEOUT.seconds).perform_later
    end

    def stop!
      port = ace_step_port

      shutdown_script = ACE_STEP_DIR.join('close_api_server.sh')
      if shutdown_script.exist?
        system(shutdown_script.to_s, '--port', port.to_s, '--force')
      else
        pid = read_pid
        if pid && process_running?(pid)
          Process.kill('TERM', pid)
          wait_for_exit(pid)
        end
      end

      AceStepSession.delete_all
      clear_pid
      Rails.logger.info "[AceStepManager] ACE-Step stopped"
    end

    def status
      running = healthy?
      pid = read_pid
      sessions = AceStepSession.count
      { running: running, pid: pid, sessions: sessions }
    end

    private

    def ace_step_url
      ENV.fetch('ACE_STEP_URL', 'http://localhost:8001')
    end

    def ace_step_port
      ENV.fetch('ACE_STEP_PORT', '8001').to_i
    end

    def startup_command
      macos_script = ACE_STEP_DIR.join('start_api_server_macos.sh')
      linux_script = ACE_STEP_DIR.join('start_api_server.sh')

      if macos_script.exist? && RUBY_PLATFORM.include?('darwin')
        [macos_script.to_s]
      elsif linux_script.exist?
        [linux_script.to_s]
      else
        ['uv', 'run', 'acestep-api', '--port', ace_step_port.to_s]
      end
    end

    def spawn_process(cmd)
      pid = Process.spawn(
        { 'ACESTEP_NO_INIT' => 'true', 'CHECK_UPDATE' => 'false' },
        *cmd,
        chdir: ACE_STEP_DIR.to_s,
        pgroup: true,
        %i[out err] => '/dev/null'
      )
      Process.detach(pid)
      pid
    end

    def wait_for_healthy
      STARTUP_TIMEOUT.step(0, -HEALTH_POLL_INTERVAL) do |remaining|
        return true if healthy?
        break if remaining <= 0
        sleep HEALTH_POLL_INTERVAL
      end
      raise StartupError, "ACE-Step did not become healthy within #{STARTUP_TIMEOUT}s"
    end

    def wait_for_exit(pid)
      30.times do
        return unless process_running?(pid)
        sleep 0.2
      end
      Process.kill('KILL', pid) rescue Errno::ESRCH
    end

    def process_running?(pid)
      Process.getpgid(pid)
      true
    rescue Errno::ESRCH
      false
    end

    def cache_pid(pid)
      Rails.cache.write('ace_step_pid', pid, expires_in: 1.hour)
    end

    def read_pid
      Rails.cache.read('ace_step_pid')
    end

    def clear_pid
      Rails.cache.delete('ace_step_pid')
    end
  end
end
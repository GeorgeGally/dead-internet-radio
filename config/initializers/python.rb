# Pipeline scripts need the project venv (dotenv, mutagen, ...). The shell that
# launched Rails may have a bare system python3 first on PATH, so prefer the venv.
venv_python = Rails.root.join(".venv/bin/python3")
Rails.application.config.x.python = venv_python.exist? ? venv_python.to_s : "python3"

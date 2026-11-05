# The static file server has no entry for the web app manifest.
Rack::Mime::MIME_TYPES[".webmanifest"] = "application/manifest+json"

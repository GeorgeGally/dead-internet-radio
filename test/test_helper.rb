ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
# rails/test_help wraps every test in a transaction that's rolled back, so
# tests leave nothing behind in the test database.
require "rails/test_help"
require "minitest/autorun"

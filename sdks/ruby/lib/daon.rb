# DAON Ruby SDK - Creator Protection for Rails Applications
# Perfect for integrating with AO3 and other fanfiction platforms

require 'faraday'
require 'json'
require 'digest'
require 'base64'

require_relative 'daon/version'
require_relative 'daon/client'
require_relative 'daon/work'
require_relative 'daon/protection_result'
require_relative 'daon/verification_result'

module Daon
  class Error < StandardError; end
  class NetworkError < Error; end
  class ValidationError < Error; end
  class ProtectionError < Error; end

  # Global configuration
  class Configuration
    attr_accessor :api_url, :chain_id, :timeout, :retries, :default_license

    def initialize
      @api_url = 'https://api.daon.network'
      @chain_id = 'daon-mainnet-1'
      @timeout = 30
      @retries = 3
      @default_license = 'liberation_v1'
    end
  end

  class << self
    attr_accessor :configuration
  end

  # Configure DAON SDK
  def self.configure
    self.configuration ||= Configuration.new
    yield(configuration)
  end

  def self.configuration
    @configuration ||= Configuration.new
  end

  # Quick protection method for simple use cases
  def self.protect_work(content, metadata = {})
    client = Client.new
    work = Work.new(content, metadata)
    client.protect(work)
  end

  # Quick verification method
  def self.verify_content(content_or_hash)
    client = Client.new
    if content_or_hash.start_with?('sha256:')
      client.verify_by_hash(content_or_hash)
    else
      client.verify(content_or_hash)
    end
  end
end
module Daon
  class ProtectionResult
    attr_reader :success, :tx_hash, :content_hash, :verification_url, :error, :timestamp

    def initialize(success:, content_hash:, tx_hash: nil, verification_url: nil, error: nil)
      @success = success
      @content_hash = content_hash
      @tx_hash = tx_hash
      @verification_url = verification_url
      @error = error
      @timestamp = Time.now
    end

    def protected?
      success
    end

    def failed?
      !success
    end

    def blockchain_url
      return nil unless tx_hash
      "https://explorer.daon.network/tx/#{tx_hash}"
    end

    def to_h
      {
        success: success,
        content_hash: content_hash,
        tx_hash: tx_hash,
        verification_url: verification_url,
        blockchain_url: blockchain_url,
        error: error,
        timestamp: timestamp.iso8601
      }
    end

    def to_json
      to_h.to_json
    end
  end
end
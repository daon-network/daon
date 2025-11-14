module Daon
  class VerificationResult
    attr_reader :verified, :content_hash, :creator, :license, :timestamp, 
                :platform, :verification_url, :error

    def initialize(verified:, content_hash:, creator: nil, license: nil, 
                   timestamp: nil, platform: nil, verification_url: nil, error: nil)
      @verified = verified
      @content_hash = content_hash
      @creator = creator
      @license = license
      @timestamp = timestamp
      @platform = platform
      @verification_url = verification_url
      @error = error
    end

    def protected?
      verified
    end

    def unprotected?
      !verified
    end

    def liberation_licensed?
      license&.include?('liberation')
    end

    def creative_commons?
      license&.start_with?('cc_')
    end

    def all_rights_reserved?
      license == 'all_rights_reserved'
    end

    def protection_date
      timestamp
    end

    def blockchain_url
      return nil unless content_hash
      "https://explorer.daon.network/content/#{content_hash}"
    end

    def to_h
      {
        verified: verified,
        content_hash: content_hash,
        creator: creator,
        license: license,
        timestamp: timestamp&.iso8601,
        platform: platform,
        verification_url: verification_url,
        blockchain_url: blockchain_url,
        error: error
      }
    end

    def to_json
      to_h.to_json
    end
  end
end
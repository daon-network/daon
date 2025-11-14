module Daon
  class Client
    attr_reader :api_url, :chain_id, :http_client

    def initialize(api_url: nil, chain_id: nil)
      @api_url = api_url || Daon.configuration.api_url
      @chain_id = chain_id || Daon.configuration.chain_id
      @http_client = build_http_client
    end

    # Protect a work with DAON blockchain
    def protect(work, license: nil, creator_address: nil)
      license ||= Daon.configuration.default_license
      
      validate_work!(work)
      
      content_hash = work.content_hash
      
      payload = {
        content_hash: content_hash,
        creator: creator_address || generate_creator_id,
        license: license,
        platform: extract_platform,
        metadata: work.metadata
      }

      response = post_with_retry('/api/v1/protect', payload)
      
      ProtectionResult.new(
        success: response['success'],
        tx_hash: response['tx_hash'],
        content_hash: content_hash,
        verification_url: response['verification_url'],
        error: response['error']
      )
    rescue => e
      ProtectionResult.new(
        success: false,
        error: "Protection failed: #{e.message}",
        content_hash: content_hash
      )
    end

    # Verify content protection status
    def verify(content)
      work = Work.new(content)
      verify_by_hash(work.content_hash)
    end

    def verify_by_hash(content_hash)
      response = get_with_retry("/api/v1/verify/#{content_hash}")
      
      VerificationResult.new(
        verified: response['verified'],
        content_hash: content_hash,
        creator: response['creator'],
        license: response['license'],
        timestamp: response['timestamp'] ? Time.at(response['timestamp']) : nil,
        platform: response['platform'],
        verification_url: response['verification_url']
      )
    rescue => e
      VerificationResult.new(
        verified: false,
        content_hash: content_hash,
        error: "Verification failed: #{e.message}"
      )
    end

    # Check Liberation License compliance
    def check_liberation_compliance(content_hash, use_case)
      payload = {
        content_hash: content_hash,
        entity_type: use_case[:entity_type], # 'individual', 'corporation', 'nonprofit'
        use_type: use_case[:use_type],       # 'personal', 'commercial', 'ai_training'
        purpose: use_case[:purpose],         # 'profit', 'education', 'humanitarian'
        compensation: use_case[:compensation] # true/false
      }

      response = post_with_retry('/api/v1/liberation/check', payload)
      
      {
        compliant: response['compliant'],
        reason: response['reason'],
        use_case: use_case,
        recommendations: response['recommendations']
      }
    rescue => e
      {
        compliant: false,
        reason: "Compliance check failed: #{e.message}",
        use_case: use_case
      }
    end

    # Bulk operations for platform integration
    def protect_batch(works, license: nil, creator_address: nil)
      results = []
      
      works.each_slice(10) do |batch| # Process in batches of 10
        batch_results = batch.map do |work|
          protect(work, license: license, creator_address: creator_address)
        end
        results.concat(batch_results)
        
        # Rate limiting - be nice to the API
        sleep(0.1) if batch.size == 10
      end
      
      results
    end

    def verify_batch(content_hashes)
      results = []
      
      content_hashes.each_slice(50) do |batch| # Verify in larger batches
        payload = { content_hashes: batch }
        response = post_with_retry('/api/v1/verify/batch', payload)
        
        batch_results = response['results'].map do |result|
          VerificationResult.new(
            verified: result['verified'],
            content_hash: result['content_hash'],
            creator: result['creator'],
            license: result['license'],
            timestamp: result['timestamp'] ? Time.at(result['timestamp']) : nil,
            platform: result['platform']
          )
        end
        
        results.concat(batch_results)
        sleep(0.1) if batch.size == 50
      end
      
      results
    rescue => e
      # Return individual verification results as fallback
      content_hashes.map { |hash| verify_by_hash(hash) }
    end

    private

    def build_http_client
      Faraday.new(url: @api_url) do |conn|
        conn.request :json
        conn.response :json, content_type: /\bjson$/
        conn.options.timeout = Daon.configuration.timeout
        conn.adapter Faraday.default_adapter
        
        # Add user agent for platform identification
        conn.headers['User-Agent'] = "DAON-Ruby-SDK/#{Daon::VERSION}"
        conn.headers['Content-Type'] = 'application/json'
        conn.headers['Accept'] = 'application/json'
      end
    end

    def validate_work!(work)
      raise ValidationError, "Work must be a Daon::Work instance" unless work.is_a?(Daon::Work)
      raise ValidationError, "Work content cannot be empty" if work.content.strip.empty?
      raise ValidationError, "Work content must be at least 10 characters" if work.content.length < 10
    end

    def extract_platform
      # Try to determine platform from caller context
      if defined?(Rails)
        # Check if this looks like AO3
        if Rails.application.class.name.downcase.include?('archive') || 
           Rails.application.class.name.downcase.include?('ao3')
          return 'archiveofourown.org'
        end
        return Rails.application.class.name.demodulize.downcase
      end
      
      'unknown_ruby_platform'
    end

    def generate_creator_id
      # For platforms without user auth, generate a stable ID
      # In production, this should be replaced with actual user identification
      "anonymous_#{Digest::SHA256.hexdigest(caller.first || 'unknown')[0..15]}"
    end

    def get_with_retry(path)
      retries = Daon.configuration.retries
      
      begin
        response = @http_client.get(path)
        handle_response(response)
      rescue Faraday::Error => e
        retries -= 1
        if retries > 0
          sleep(1)
          retry
        else
          raise NetworkError, "Failed to connect to DAON network: #{e.message}"
        end
      end
    end

    def post_with_retry(path, payload)
      retries = Daon.configuration.retries
      
      begin
        response = @http_client.post(path, payload)
        handle_response(response)
      rescue Faraday::Error => e
        retries -= 1
        if retries > 0
          sleep(1)
          retry
        else
          raise NetworkError, "Failed to connect to DAON network: #{e.message}"
        end
      end
    end

    def handle_response(response)
      case response.status
      when 200..299
        response.body
      when 400
        raise ValidationError, response.body['error'] || 'Bad request'
      when 404
        raise Error, 'Content not found'
      when 429
        raise NetworkError, 'Rate limit exceeded. Please try again later.'
      when 500..599
        raise NetworkError, 'DAON network error. Please try again later.'
      else
        raise Error, "Unexpected response: #{response.status}"
      end
    end
  end
end
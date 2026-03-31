require 'spec_helper'
require 'digest'
require 'json'

RSpec.describe Daon::Client do
  # Content for HTTP tests — must be ≥ 10 chars to pass SDK validation
  TEST_CONTENT = 'test content for daon sdk integration tests'
  TEST_HASH_HEX = Digest::SHA256.hexdigest(TEST_CONTENT)
  TEST_HASH = "sha256:#{TEST_HASH_HEX}"
  API_URL = 'https://api.daon.network'

  let(:client) { described_class.new }

  let(:protect_body) do
    {
      success: true,
      contentHash: TEST_HASH_HEX,
      verificationUrl: "https://app.daon.network/verify/#{TEST_HASH_HEX}",
      timestamp: '2026-01-01T00:00:00.000Z',
      license: 'liberation_v1',
      blockchainTx: nil,
      blockchain: { enabled: false, tx: nil }
    }.to_json
  end

  let(:verify_body) do
    {
      success: true,
      isValid: true,
      contentHash: TEST_HASH_HEX,
      license: 'liberation_v1',
      timestamp: '2026-01-01T00:00:00.000Z',
      verificationUrl: "https://app.daon.network/verify/#{TEST_HASH_HEX}"
    }.to_json
  end

  # -------------------------------------------------------------------------
  # check_liberation_compliance (pure — no network)
  # -------------------------------------------------------------------------

  describe '#check_liberation_compliance' do
    it 'blocks corporate AI training without compensation' do
      result = client.check_liberation_compliance(TEST_HASH, {
        entity_type: 'corporation', use_type: 'ai_training',
        purpose: 'profit', compensation: false
      })
      expect(result[:compliant]).to be false
      expect(result[:reason]).to match(/training/i)
    end

    it 'blocks corporate profit use without compensation' do
      result = client.check_liberation_compliance(TEST_HASH, {
        entity_type: 'corporation', use_type: 'commercial',
        purpose: 'profit', compensation: false
      })
      expect(result[:compliant]).to be false
    end

    it 'allows corporate use when compensated' do
      result = client.check_liberation_compliance(TEST_HASH, {
        entity_type: 'corporation', use_type: 'ai_training',
        purpose: 'profit', compensation: true
      })
      expect(result[:compliant]).to be true
    end

    it 'allows individual personal use' do
      result = client.check_liberation_compliance(TEST_HASH, {
        entity_type: 'individual', use_type: 'personal',
        purpose: 'education', compensation: false
      })
      expect(result[:compliant]).to be true
    end

    it 'allows nonprofit humanitarian use' do
      result = client.check_liberation_compliance(TEST_HASH, {
        entity_type: 'nonprofit', use_type: 'education',
        purpose: 'humanitarian', compensation: false
      })
      expect(result[:compliant]).to be true
    end
  end

  # -------------------------------------------------------------------------
  # protect()
  # -------------------------------------------------------------------------

  describe '#protect' do
    it 'sends content (not content_hash) in request body' do
      stub = stub_request(:post, "#{API_URL}/api/v1/protect")
        .to_return(status: 201, body: protect_body, headers: { 'Content-Type' => 'application/json' })

      work = Daon::Work.new(TEST_CONTENT)
      client.protect(work)

      expect(stub).to have_been_requested
      body = JSON.parse(WebMock::RequestRegistry.instance.requested_signatures.hash.keys.last.body)
      expect(body).to have_key('content')
      expect(body['content']).to eq(TEST_CONTENT)
      expect(body).not_to have_key('content_hash')
      expect(body).not_to have_key('creator')
    end

    it 'prefixes contentHash from response with sha256:' do
      stub_request(:post, "#{API_URL}/api/v1/protect")
        .to_return(status: 201, body: protect_body, headers: { 'Content-Type' => 'application/json' })

      work = Daon::Work.new(TEST_CONTENT)
      result = client.protect(work)

      expect(result.success).to be true
      expect(result.content_hash).to eq(TEST_HASH)
    end

    it 'maps blockchainTx from response' do
      body = JSON.parse(protect_body)
      body['blockchainTx'] = 'ABC123TX'
      stub_request(:post, "#{API_URL}/api/v1/protect")
        .to_return(status: 201, body: body.to_json, headers: { 'Content-Type' => 'application/json' })

      result = client.protect(Daon::Work.new(TEST_CONTENT))
      expect(result.tx_hash).to eq('ABC123TX')
    end

    it 'returns a failed result on server error' do
      stub_request(:post, "#{API_URL}/api/v1/protect").to_return(status: 500)

      result = client.protect(Daon::Work.new(TEST_CONTENT))
      expect(result.success).to be false
    end
  end

  # -------------------------------------------------------------------------
  # verify_by_hash()
  # -------------------------------------------------------------------------

  describe '#verify_by_hash' do
    it 'strips sha256: prefix before calling the API' do
      stub = stub_request(:get, "#{API_URL}/api/v1/verify/#{TEST_HASH_HEX}")
        .to_return(status: 200, body: verify_body, headers: { 'Content-Type' => 'application/json' })

      client.verify_by_hash(TEST_HASH)

      expect(stub).to have_been_requested
    end

    it 'maps isValid → verified: true' do
      stub_request(:get, "#{API_URL}/api/v1/verify/#{TEST_HASH_HEX}")
        .to_return(status: 200, body: verify_body, headers: { 'Content-Type' => 'application/json' })

      result = client.verify_by_hash(TEST_HASH)

      expect(result.verified).to be true
      expect(result.license).to eq('liberation_v1')
    end

    it 'returns verified: false on 404' do
      stub_request(:get, "#{API_URL}/api/v1/verify/#{TEST_HASH_HEX}")
        .to_return(status: 404, body: '{"error":"not found"}', headers: { 'Content-Type' => 'application/json' })

      result = client.verify_by_hash(TEST_HASH)

      expect(result.verified).to be false
    end

    it 'returns verified: false when isValid is false' do
      body = JSON.parse(verify_body)
      body['isValid'] = false
      stub_request(:get, "#{API_URL}/api/v1/verify/#{TEST_HASH_HEX}")
        .to_return(status: 200, body: body.to_json, headers: { 'Content-Type' => 'application/json' })

      result = client.verify_by_hash(TEST_HASH)

      expect(result.verified).to be false
    end
  end

  # -------------------------------------------------------------------------
  # verify() (content → hash → API)
  # -------------------------------------------------------------------------

  describe '#verify' do
    it 'hashes the content and calls the API with the bare hex' do
      stub = stub_request(:get, "#{API_URL}/api/v1/verify/#{TEST_HASH_HEX}")
        .to_return(status: 200, body: verify_body, headers: { 'Content-Type' => 'application/json' })

      client.verify(TEST_CONTENT)

      expect(stub).to have_been_requested
    end
  end
end

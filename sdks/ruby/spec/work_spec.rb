require 'spec_helper'
require 'digest'

RSpec.describe Daon::Work do
  # Known SHA-256 test vector — use distinct names to avoid collision with client_spec constants
  WORK_HASH_TEST_CONTENT = 'test'
  WORK_HASH_TEST_HEX = Digest::SHA256.hexdigest(WORK_HASH_TEST_CONTENT)
  WORK_HASH_TEST = "sha256:#{WORK_HASH_TEST_HEX}"

  describe '#content_hash' do
    it 'matches the known SHA-256 test vector' do
      work = described_class.new(WORK_HASH_TEST_CONTENT)
      expect(work.content_hash).to eq(WORK_HASH_TEST)
    end

    it 'returns a sha256: prefixed 64-char hex string' do
      work = described_class.new('any content here')
      expect(work.content_hash).to match(/\Asha256:[0-9a-f]{64}\z/)
    end

    it 'does NOT normalise whitespace' do
      w1 = described_class.new('foo  bar')
      w2 = described_class.new('foo bar')
      expect(w1.content_hash).not_to eq(w2.content_hash)
    end

    it 'does NOT normalise line endings' do
      w1 = described_class.new("foo\r\nbar")
      w2 = described_class.new("foo\nbar")
      expect(w1.content_hash).not_to eq(w2.content_hash)
    end

    it 'does NOT strip leading/trailing whitespace' do
      w1 = described_class.new('  test  ')
      w2 = described_class.new('test')
      expect(w1.content_hash).not_to eq(w2.content_hash)
    end

    it 'memoises the hash (same object returned on repeated calls)' do
      work = described_class.new(WORK_HASH_TEST_CONTENT)
      expect(work.content_hash).to equal(work.content_hash)
    end
  end

  describe '#valid?' do
    it 'returns true for sufficient content' do
      expect(described_class.new('a' * 10)).to be_valid
    end

    it 'returns false for content shorter than 10 chars' do
      expect(described_class.new('short')).not_to be_valid
    end

    it 'returns false for empty content' do
      expect(described_class.new('')).not_to be_valid
    end
  end
end

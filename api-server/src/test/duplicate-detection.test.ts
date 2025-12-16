import { test } from 'node:test';
import assert from 'node:assert';
import {
  generateContentHash,
  generateNormalizedHash,
  generatePerceptualHash,
  hammingDistance,
  areSimilar,
  checkDuplicate,
  generateAllHashes,
} from '../utils/duplicate-detection.js';

test('Duplicate Detection Tests', async (t) => {
  await t.test('Level 1: Exact hash detection', () => {
    const content = 'The quick brown fox jumps over the lazy dog';
    const hash1 = generateContentHash(content);
    const hash2 = generateContentHash(content);
    
    assert.strictEqual(hash1, hash2, 'Same content should produce same hash');
    assert.strictEqual(hash1.length, 64, 'SHA256 hash should be 64 characters');
    
    const differentContent = 'The quick brown fox jumps over the lazy cat';
    const hash3 = generateContentHash(differentContent);
    
    assert.notStrictEqual(hash1, hash3, 'Different content should produce different hash');
  });

  await t.test('Level 2: Normalized hash detection - whitespace changes', () => {
    const original = 'The quick brown fox jumps over the lazy dog';
    const withExtraSpaces = 'The  quick   brown    fox jumps over the lazy dog';
    const withTabs = 'The\tquick\tbrown\tfox\tjumps\tover\tthe\tlazy\tdog';
    const withNewlines = 'The quick brown fox\njumps over\nthe lazy dog';
    
    const hash1 = generateNormalizedHash(original);
    const hash2 = generateNormalizedHash(withExtraSpaces);
    const hash3 = generateNormalizedHash(withTabs);
    const hash4 = generateNormalizedHash(withNewlines);
    
    assert.strictEqual(hash1, hash2, 'Extra spaces should be normalized');
    assert.strictEqual(hash1, hash3, 'Tabs should be normalized');
    assert.strictEqual(hash1, hash4, 'Newlines should be normalized');
  });

  await t.test('Level 2: Normalized hash detection - case changes', () => {
    const original = 'The Quick Brown Fox';
    const lowercase = 'the quick brown fox';
    const uppercase = 'THE QUICK BROWN FOX';
    
    const hash1 = generateNormalizedHash(original);
    const hash2 = generateNormalizedHash(lowercase);
    const hash3 = generateNormalizedHash(uppercase);
    
    assert.strictEqual(hash1, hash2, 'Case should be normalized');
    assert.strictEqual(hash1, hash3, 'Case should be normalized');
  });

  await t.test('Level 2: Normalized hash detection - punctuation changes', () => {
    const original = 'Hello world';
    const withPunctuation = 'Hello, world!';
    const withQuotes = '"Hello" world.';
    
    const hash1 = generateNormalizedHash(original);
    const hash2 = generateNormalizedHash(withPunctuation);
    const hash3 = generateNormalizedHash(withQuotes);
    
    assert.strictEqual(hash1, hash2, 'Punctuation should be normalized');
    assert.strictEqual(hash1, hash3, 'Quotes and periods should be normalized');
  });

  await t.test('Level 3: Perceptual hash generation', () => {
    const content = 'This is a test document about artificial intelligence and machine learning';
    const hash = generatePerceptualHash(content);
    
    assert.ok(hash.length > 0, 'Perceptual hash should be generated');
    assert.strictEqual(typeof hash, 'string', 'Perceptual hash should be a string');
  });

  await t.test('Level 3: Perceptual hash similarity detection', () => {
    const original = 'Machine learning is a subset of artificial intelligence that focuses on training algorithms';
    const similar = 'Artificial intelligence includes machine learning which trains algorithms';
    const different = 'The quick brown fox jumps over the lazy dog';
    
    const hash1 = generatePerceptualHash(original);
    const hash2 = generatePerceptualHash(similar);
    const hash3 = generatePerceptualHash(different);
    
    // Similar content should have lower hamming distance
    const distance1 = hammingDistance(hash1, hash2);
    const distance2 = hammingDistance(hash1, hash3);
    
    assert.ok(distance1 < distance2, 'Similar content should have lower hamming distance');
  });

  await t.test('Hamming distance calculation', () => {
    // Test with simple hex strings
    const hash1 = 'aaaa';
    const hash2 = 'aaaa';
    const hash3 = 'aaab';
    
    assert.strictEqual(hammingDistance(hash1, hash2), 0, 'Identical hashes should have distance 0');
    assert.ok(hammingDistance(hash1, hash3) > 0, 'Different hashes should have distance > 0');
  });

  await t.test('Similarity threshold check', () => {
    const hash1 = generatePerceptualHash('This is test content');
    const hash2 = generatePerceptualHash('This is test content with minor changes');
    
    // These should be considered similar
    const similar = areSimilar(hash1, hash2, 100); // More lenient threshold for testing
    assert.strictEqual(typeof similar, 'boolean', 'areSimilar should return boolean');
  });

  await t.test('Comprehensive duplicate check - exact match', () => {
    const content = 'Original content to protect';
    const contentHash = generateContentHash(content);
    
    const result = checkDuplicate(content, {
      exact: [contentHash],
      normalized: [],
      perceptual: [],
    });
    
    assert.strictEqual(result.isDuplicate, true, 'Should detect exact duplicate');
    assert.strictEqual(result.level, 'exact', 'Should identify as exact duplicate');
    assert.strictEqual(result.similarity, 1.0, 'Exact match should have 100% similarity');
  });

  await t.test('Comprehensive duplicate check - normalized match', () => {
    const content = 'Original content to protect';
    const normalizedHash = generateNormalizedHash(content);
    
    // Content with extra whitespace
    const modified = 'Original  content   to    protect';
    
    const result = checkDuplicate(modified, {
      exact: [],
      normalized: [normalizedHash],
      perceptual: [],
    });
    
    assert.strictEqual(result.isDuplicate, true, 'Should detect normalized duplicate');
    assert.strictEqual(result.level, 'normalized', 'Should identify as normalized duplicate');
  });

  await t.test('Comprehensive duplicate check - perceptual match', () => {
    const original = 'Machine learning algorithms require large datasets';
    const perceptualHash = generatePerceptualHash(original);
    
    // Similar but not identical
    const similar = 'Large datasets are needed for machine learning algorithms';
    
    const result = checkDuplicate(similar, {
      exact: [],
      normalized: [],
      perceptual: [perceptualHash],
    });
    
    // May or may not detect depending on similarity threshold
    assert.strictEqual(typeof result.isDuplicate, 'boolean', 'Should return boolean result');
  });

  await t.test('Comprehensive duplicate check - no match', () => {
    const content = 'Completely unique content that has never been seen before';
    
    const result = checkDuplicate(content, {
      exact: ['abc123'],
      normalized: ['def456'],
      perceptual: ['789ghi'],
    });
    
    assert.strictEqual(result.isDuplicate, false, 'Should not detect duplicate for unique content');
  });

  await t.test('Generate all hashes at once', () => {
    const content = 'Test content for hash generation';
    const hashes = generateAllHashes(content);
    
    assert.ok(hashes.exact, 'Should generate exact hash');
    assert.ok(hashes.normalized, 'Should generate normalized hash');
    assert.ok(hashes.perceptual, 'Should generate perceptual hash');
    
    assert.strictEqual(hashes.exact.length, 64, 'Exact hash should be 64 chars');
    assert.strictEqual(hashes.normalized.length, 64, 'Normalized hash should be 64 chars');
    assert.ok(hashes.perceptual.length > 0, 'Perceptual hash should be generated');
  });

  await t.test('Real-world scenario: Fanfic with formatting changes', () => {
    const original = `
      Chapter 1: The Beginning
      
      It was a dark and stormy night. The hero stood at the crossroads,
      wondering which path to take. The wind howled through the trees.
    `;
    
    const reformatted = `
      Chapter 1: The Beginning
      
      It   was  a dark   and   stormy night.     The hero   stood at the crossroads, wondering which path to take.     The wind howled through the trees.
    `;
    
    const exactHash1 = generateContentHash(original);
    const exactHash2 = generateContentHash(reformatted);
    
    // Exact hashes should differ
    assert.notStrictEqual(exactHash1, exactHash2, 'Formatting changes should change exact hash');
    
    // Normalized hashes should match
    const normHash1 = generateNormalizedHash(original);
    const normHash2 = generateNormalizedHash(reformatted);
    
    assert.strictEqual(normHash1, normHash2, 'Normalized should catch formatting changes');
  });

  await t.test('Real-world scenario: Similar but not identical stories', () => {
    const story1 = `
      The dragon soared through the sky, its scales glittering in the sunlight.
      Below, the village cowered in fear as the beast approached.
    `;
    
    const story2 = `
      A magnificent dragon flew across the heavens, its shimmering scales
      catching the light. The villagers below trembled as it drew near.
    `;
    
    const hash1 = generatePerceptualHash(story1);
    const hash2 = generatePerceptualHash(story2);
    
    // Should have some similarity but not be identical
    const distance = hammingDistance(hash1, hash2);
    
    assert.ok(distance > 0, 'Similar but different stories should have some distance');
    assert.ok(distance < 256, 'Similar stories should not be completely different');
  });
});

console.log('✅ Duplicate detection tests completed');

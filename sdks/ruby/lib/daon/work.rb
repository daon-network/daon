module Daon
  class Work
    attr_reader :content, :metadata

    def initialize(content, metadata = {})
      @content = content.to_s
      @metadata = normalize_metadata(metadata)
    end

    # Generate content hash for DAON blockchain
    def content_hash
      @content_hash ||= generate_content_hash
    end

    # Extract meaningful content for hashing (removes formatting, etc.)
    def normalized_content
      @normalized_content ||= normalize_content_for_hashing(@content)
    end

    # AO3-specific helper methods
    def self.from_ao3_work(ao3_work)
      # Extract content and metadata from AO3 work object
      # This assumes standard AO3 model structure
      
      content = extract_ao3_content(ao3_work)
      metadata = extract_ao3_metadata(ao3_work)
      
      new(content, metadata)
    end

    # Generic ActiveRecord helper
    def self.from_activerecord(record, content_field: :content, metadata_fields: {})
      content = record.send(content_field)
      
      metadata = metadata_fields.each_with_object({}) do |(key, field), hash|
        hash[key] = record.send(field) if record.respond_to?(field)
      end
      
      # Add common fields if available
      metadata[:title] = record.title if record.respond_to?(:title)
      metadata[:author] = record.user&.login if record.respond_to?(:user)
      metadata[:created_at] = record.created_at if record.respond_to?(:created_at)
      metadata[:updated_at] = record.updated_at if record.respond_to?(:updated_at)
      
      new(content, metadata)
    end

    # Validation helpers
    def valid?
      !content.strip.empty? && content.length >= 10
    end

    def errors
      errors = []
      errors << "Content cannot be empty" if content.strip.empty?
      errors << "Content must be at least 10 characters" if content.length < 10
      errors << "Content is too large (>10MB)" if content.bytesize > 10_485_760
      errors
    end

    private

    def normalize_metadata(metadata)
      normalized = {}
      
      # Convert all keys to strings and handle common variations
      metadata.each do |key, value|
        string_key = key.to_s.downcase
        
        case string_key
        when 'title', 'work_title', 'name'
          normalized['title'] = value.to_s.strip
        when 'author', 'author_name', 'user', 'username', 'creator'
          normalized['author'] = value.to_s.strip
        when 'fandom', 'fandoms'
          normalized['fandoms'] = Array(value).map(&:to_s)
        when 'character', 'characters'
          normalized['characters'] = Array(value).map(&:to_s)
        when 'relationship', 'relationships', 'pairing', 'pairings'
          normalized['relationships'] = Array(value).map(&:to_s)
        when 'tag', 'tags', 'additional_tags'
          normalized['tags'] = Array(value).map(&:to_s)
        when 'rating'
          normalized['rating'] = value.to_s.strip
        when 'warning', 'warnings'
          normalized['warnings'] = Array(value).map(&:to_s)
        when 'category', 'categories'
          normalized['categories'] = Array(value).map(&:to_s)
        when 'word_count', 'words'
          normalized['word_count'] = value.to_i
        when 'chapter', 'chapters'
          normalized['chapters'] = value.to_s
        when 'language'
          normalized['language'] = value.to_s.strip
        when 'published_at', 'publish_date', 'created_at'
          normalized['published_at'] = parse_datetime(value)
        when 'updated_at', 'revised_at'
          normalized['updated_at'] = parse_datetime(value)
        when 'url', 'work_url'
          normalized['url'] = value.to_s.strip
        else
          # Keep other metadata as-is but convert to string keys
          normalized[string_key] = value
        end
      end
      
      normalized
    end

    def parse_datetime(value)
      case value
      when Time, DateTime
        value.iso8601
      when Date
        value.to_time.iso8601
      when String
        begin
          Time.parse(value).iso8601
        rescue ArgumentError
          value.to_s
        end
      else
        value.to_s
      end
    end

    def generate_content_hash
      normalized = normalized_content
      digest = Digest::SHA256.hexdigest(normalized)
      "sha256:#{digest}"
    end

    def normalize_content_for_hashing(content)
      # Normalize content for consistent hashing across platforms
      normalized = content.dup
      
      # Remove excessive whitespace
      normalized = normalized.gsub(/\r\n/, "\n")  # Normalize line endings
      normalized = normalized.gsub(/\r/, "\n")    # Handle old Mac line endings
      normalized = normalized.gsub(/[ \t]+/, " ") # Normalize spaces and tabs
      normalized = normalized.gsub(/\n{3,}/, "\n\n") # Limit consecutive newlines
      normalized = normalized.strip               # Remove leading/trailing whitespace
      
      # Remove HTML if present (for platforms that store HTML)
      if normalized.include?('<') && normalized.include?('>')
        # Simple HTML stripping - for more complex needs, use a proper HTML parser
        normalized = normalized.gsub(/<[^>]*>/, '')
        normalized = normalize_html_entities(normalized)
      end
      
      normalized
    end

    def normalize_html_entities(text)
      # Handle common HTML entities
      text.gsub('&amp;', '&')
          .gsub('&lt;', '<')
          .gsub('&gt;', '>')
          .gsub('&quot;', '"')
          .gsub('&#39;', "'")
          .gsub('&nbsp;', ' ')
    end

    def self.extract_ao3_content(ao3_work)
      # Handle AO3's chapter system
      if ao3_work.respond_to?(:chapters) && ao3_work.chapters.any?
        # Combine all chapters
        ao3_work.chapters.map do |chapter|
          chapter.respond_to?(:content) ? chapter.content : chapter.to_s
        end.join("\n\n")
      elsif ao3_work.respond_to?(:content)
        ao3_work.content
      elsif ao3_work.respond_to?(:body)
        ao3_work.body
      else
        ao3_work.to_s
      end
    end

    def self.extract_ao3_metadata(ao3_work)
      metadata = {}
      
      # Standard AO3 fields
      metadata[:title] = ao3_work.title if ao3_work.respond_to?(:title)
      metadata[:author] = ao3_work.users.map(&:login).join(', ') if ao3_work.respond_to?(:users)
      
      # Tags and categories
      if ao3_work.respond_to?(:tags)
        metadata[:fandoms] = ao3_work.fandoms.map(&:name) if ao3_work.respond_to?(:fandoms)
        metadata[:characters] = ao3_work.characters.map(&:name) if ao3_work.respond_to?(:characters)
        metadata[:relationships] = ao3_work.relationships.map(&:name) if ao3_work.respond_to?(:relationships)
        metadata[:tags] = ao3_work.freeforms.map(&:name) if ao3_work.respond_to?(:freeforms)
        metadata[:warnings] = ao3_work.warnings.map(&:name) if ao3_work.respond_to?(:warnings)
        metadata[:categories] = ao3_work.categories.map(&:name) if ao3_work.respond_to?(:categories)
        metadata[:rating] = ao3_work.ratings.first&.name if ao3_work.respond_to?(:ratings)
      end
      
      # Stats
      metadata[:word_count] = ao3_work.word_count if ao3_work.respond_to?(:word_count)
      metadata[:chapters] = "#{ao3_work.chapters.count}/#{ao3_work.expected_number_of_chapters || '?'}" if ao3_work.respond_to?(:chapters)
      metadata[:language] = ao3_work.language&.short if ao3_work.respond_to?(:language)
      
      # Dates
      metadata[:published_at] = ao3_work.first_chapter&.published_at if ao3_work.respond_to?(:first_chapter)
      metadata[:updated_at] = ao3_work.chapters.maximum(:published_at) if ao3_work.respond_to?(:chapters)
      
      # URL
      if ao3_work.respond_to?(:id) && defined?(Rails)
        metadata[:url] = "https://archiveofourown.org/works/#{ao3_work.id}"
      end
      
      metadata
    end
  end
end
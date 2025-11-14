Gem::Specification.new do |spec|
  spec.name          = "daon"
  spec.version       = "1.0.0"
  spec.authors       = ["DAON Network Contributors"]
  spec.email         = ["hello@daon.network"]
  
  spec.summary       = "DAON Ruby SDK - Digital Asset Ownership Network integration"
  spec.description   = <<~DESC
    Ruby SDK for integrating with DAON (Digital Asset Ownership Network).
    Provides blockchain-based creator rights protection, AI training compliance,
    and Liberation License enforcement for Ruby applications.
    
    Perfect for content platforms, creative communities, and creator tools.
  DESC
  
  spec.homepage      = "https://daon.network"
  spec.license       = "Apache-2.0"
  spec.required_ruby_version = ">= 2.7.0"
  
  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "https://github.com/daon-network/daon-ruby"
  spec.metadata["changelog_uri"] = "https://github.com/daon-network/daon-ruby/blob/main/CHANGELOG.md"
  spec.metadata["documentation_uri"] = "https://docs.daon.network/ruby"
  
  # Specify which files should be added to the gem when it is released.
  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    `git ls-files -z`.split("\x0").reject { |f| f.match(%r{\A(?:test|spec|features)/}) }
  end
  
  spec.bindir        = "exe"
  spec.executables   = spec.files.grep(%r{\Aexe/}) { |f| File.basename(f) }
  spec.require_paths = ["lib"]
  
  # Core dependencies
  spec.add_dependency "faraday", "~> 2.0"
  spec.add_dependency "faraday-retry", "~> 2.0"
  spec.add_dependency "json", "~> 2.0"
  spec.add_dependency "digest", "~> 3.0"
  
  # For blockchain interaction
  spec.add_dependency "secp256k1", "~> 4.0"
  spec.add_dependency "base58", "~> 0.2"
  
  # Development dependencies
  spec.add_development_dependency "rspec", "~> 3.0"
  spec.add_development_dependency "vcr", "~> 6.0"
  spec.add_development_dependency "webmock", "~> 3.0"
  spec.add_development_dependency "rubocop", "~> 1.0"
  spec.add_development_dependency "yard", "~> 0.9"
  
  # Rails integration (optional)
  spec.add_development_dependency "rails", ">= 6.0"
  spec.add_development_dependency "sqlite3", "~> 1.4"
end
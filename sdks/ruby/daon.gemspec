Gem::Specification.new do |spec|
  spec.name          = "daon"
  spec.version       = "1.0.0"
  spec.authors       = ["DAON Network"]
  spec.email         = ["dev@daon.network"]

  spec.summary       = %q{DAON Creator Protection SDK for Ruby/Rails applications}
  spec.description   = %q{Easy integration with DAON blockchain for creator content protection. Perfect for AO3 and other fanfiction platforms.}
  spec.homepage      = "https://github.com/daon-network/ruby-sdk"
  spec.license       = "Liberation-1.0"
  spec.metadata["license_uri"] = "https://github.com/liberationlicense/license"

  spec.required_ruby_version = ">= 2.7.0"

  spec.files         = Dir.glob("{lib,spec}/**/*") + %w[README.md LICENSE]
  spec.bindir        = "exe"
  spec.executables   = spec.files.grep(%r{^exe/}) { |f| File.basename(f) }
  spec.require_paths = ["lib"]

  # Dependencies for AO3 compatibility
  spec.add_dependency "faraday", "~> 2.0"
  spec.add_dependency "json", "~> 2.0"
  spec.add_dependency "digest", "~> 3.0"
  spec.add_dependency "base64", "~> 0.1"

  # Development dependencies
  spec.add_development_dependency "rspec", "~> 3.0"
  spec.add_development_dependency "webmock", "~> 3.0"
  spec.add_development_dependency "rake", "~> 13.0"
end
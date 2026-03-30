require 'webmock/rspec'
require 'daon'

RSpec.configure do |config|
  config.expect_with :rspec do |c|
    c.syntax = :expect
  end

  # Disable all real HTTP during tests
  WebMock.disable_net_connect!
end

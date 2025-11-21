# 🛡️ DAON Integration Guide for AO3
## Easy Creator Protection for Archive of Our Own

### Overview

This guide shows how to integrate DAON creator protection directly into AO3's Rails codebase with minimal changes. **No major refactoring required** - just add protection as works are published.

---

## 🚀 Quick Setup (30 minutes)

### 1. Install DAON Ruby SDK

Add to your `Gemfile`:
```ruby
gem 'daon', '~> 1.0'
```

Run:
```bash
bundle install
```

### 2. Configure DAON

Create `config/initializers/daon.rb`:
```ruby
Daon.configure do |config|
  config.api_url = ENV.fetch('DAON_API_URL', 'https://api.daon.network')
  config.default_license = 'liberation_v1'  # Recommended for fanfiction
  config.timeout = 30
  config.retries = 3
end
```

Add to your environment variables:
```bash
# .env or system environment
DAON_API_URL=https://api.daon.network
```

### 3. Add Protection to Work Model

In your `Work` model (`app/models/work.rb`), add:

```ruby
class Work < ApplicationRecord
  # ... existing code ...
  
  # DAON protection fields
  has_one :daon_protection, dependent: :destroy
  
  after_create :protect_with_daon, if: :should_protect?
  after_update :update_daon_protection, if: :should_update_protection?
  
  private
  
  def should_protect?
    # Only protect if user opted in and work is public
    user_opted_for_protection? && !restricted?
  end
  
  def should_update_protection?
    # Update protection if content changed and already protected
    saved_change_to_content? && daon_protection.present?
  end
  
  def protect_with_daon
    return unless should_protect?
    
    begin
      work = Daon::Work.from_ao3_work(self)
      result = Daon.protect(work.content, work.metadata, selected_license)
      
      if result.success
        DaonProtection.create!(
          work: self,
          content_hash: result.content_hash,
          tx_hash: result.tx_hash,
          verification_url: result.verification_url,
          license: selected_license,
          protected_at: Time.current
        )
      end
    rescue => e
      Rails.logger.error "DAON protection failed for work #{id}: #{e.message}"
      # Don't fail the work creation if DAON is down
    end
  end
  
  def update_daon_protection
    # Update existing protection with new content hash
    protect_with_daon if daon_protection.present?
  end
  
  def user_opted_for_protection?
    # Check if user has enabled DAON protection in preferences
    users.first&.preference&.enable_daon_protection?
  end
  
  def selected_license
    # Use work-specific license or user default
    daon_license.presence || users.first&.preference&.default_daon_license || 'liberation_v1'
  end
end
```

### 4. Create DAON Protection Model

Create migration:
```bash
rails generate migration CreateDaonProtections work:references content_hash:string tx_hash:string verification_url:string license:string protected_at:datetime
```

Migration file (`db/migrate/xxx_create_daon_protections.rb`):
```ruby
class CreateDaonProtections < ActiveRecord::Migration[7.0]
  def change
    create_table :daon_protections do |t|
      t.references :work, null: false, foreign_key: true
      t.string :content_hash, null: false
      t.string :tx_hash
      t.string :verification_url
      t.string :license, null: false
      t.datetime :protected_at, null: false
      
      t.timestamps
    end
    
    add_index :daon_protections, :content_hash, unique: true
    add_index :daon_protections, :tx_hash
  end
end
```

Create model (`app/models/daon_protection.rb`):
```ruby
class DaonProtection < ApplicationRecord
  belongs_to :work
  
  validates :content_hash, presence: true, uniqueness: true
  validates :license, presence: true
  validates :protected_at, presence: true
  
  scope :verified, -> { where.not(tx_hash: nil) }
  scope :by_license, ->(license) { where(license: license) }
  
  def verified?
    tx_hash.present?
  end
  
  def blockchain_url
    return nil unless tx_hash
    "https://explorer.daon.network/tx/#{tx_hash}"
  end
end
```

### 5. Add User Preferences

Add to user preferences migration:
```ruby
add_column :preferences, :enable_daon_protection, :boolean, default: false
add_column :preferences, :default_daon_license, :string, default: 'liberation_v1'
```

Update preferences form to include DAON options:
```erb
<!-- In user preferences form -->
<fieldset>
  <legend>Creator Protection</legend>
  <dl>
    <dt><%= f.label :enable_daon_protection, "Enable DAON Protection" %></dt>
    <dd>
      <%= f.check_box :enable_daon_protection %>
      <p class="note">Automatically protect your works with blockchain verification to prevent AI exploitation</p>
    </dd>
    
    <dt><%= f.label :default_daon_license, "Default License" %></dt>
    <dd>
      <%= f.select :default_daon_license, [
        ['Liberation License v1.0 (Recommended)', 'liberation_v1'],
        ['Creative Commons BY-NC', 'cc_by_nc'],
        ['Creative Commons BY-NC-SA', 'cc_by_nc_sa'],
        ['All Rights Reserved', 'all_rights_reserved']
      ] %>
      <p class="note">Liberation License blocks corporate AI training without compensation</p>
    </dd>
  </dl>
</fieldset>
```

---

## 🎯 Display Protection Status

### Work Show Page

Add protection status to work display (`app/views/works/show.html.erb`):

```erb
<!-- Add near work metadata -->
<% if @work.daon_protection.present? %>
  <dt class="daon-protection">Protection:</dt>
  <dd class="daon-protection">
    <span class="protected">🛡️ Protected by DAON</span>
    <p class="note">
      License: <%= @work.daon_protection.license.humanize %>
      <% if @work.daon_protection.verified? %>
        | <a href="<%= @work.daon_protection.verification_url %>" target="_blank">Verify on blockchain</a>
      <% end %>
    </p>
  </dd>
<% else %>
  <% if @work.users.first&.preference&.enable_daon_protection? %>
    <dt class="daon-protection">Protection:</dt>
    <dd class="daon-protection">
      <span class="unprotected">⚠️ Protection pending</span>
      <p class="note">This work will be protected automatically</p>
    </dd>
  <% end %>
<% end %>
```

### Work Form (Optional License Selection)

Add to work posting form:
```erb
<!-- In work form, after existing fields -->
<fieldset>
  <legend>Creator Protection</legend>
  <dl>
    <dt><%= f.label :daon_license, "DAON License (Optional)" %></dt>
    <dd>
      <%= f.select :daon_license, [
        ['Use my default license', ''],
        ['Liberation License v1.0', 'liberation_v1'],
        ['Creative Commons BY-NC', 'cc_by_nc'],
        ['All Rights Reserved', 'all_rights_reserved']
      ], { include_blank: false } %>
      <p class="note">Override your default license for this work only</p>
    </dd>
  </dl>
</fieldset>
```

---

## 🔍 Verification Features

### Public Verification API

Create controller for public verification (`app/controllers/daon_controller.rb`):
```ruby
class DaonController < ApplicationController
  before_action :set_work, only: [:verify]
  
  def verify
    if @work&.daon_protection
      protection = @work.daon_protection
      render json: {
        verified: true,
        content_hash: protection.content_hash,
        license: protection.license,
        protected_at: protection.protected_at,
        verification_url: protection.verification_url,
        blockchain_url: protection.blockchain_url
      }
    else
      render json: { verified: false }
    end
  end
  
  private
  
  def set_work
    @work = Work.find(params[:work_id])
  end
end
```

Add route:
```ruby
# In routes.rb
resources :works do
  get 'daon/verify', to: 'daon#verify'
end
```

### Bulk Protection for Existing Works

Create rake task for protecting existing works:
```ruby
# lib/tasks/daon.rake
namespace :daon do
  desc "Protect existing works for users who opted in"
  task protect_existing: :environment do
    users_with_protection = User.joins(:preference).where(preferences: { enable_daon_protection: true })
    
    users_with_protection.find_each do |user|
      puts "Processing works for user #{user.login}..."
      
      user.works.where.missing(:daon_protection).find_each do |work|
        next if work.restricted? # Skip private works
        
        begin
          work.send(:protect_with_daon)
          puts "  ✅ Protected: #{work.title}"
          sleep(0.1) # Rate limiting
        rescue => e
          puts "  ❌ Failed: #{work.title} - #{e.message}"
        end
      end
    end
  end
  
  desc "Verify all DAON protections"
  task verify_all: :environment do
    DaonProtection.find_each do |protection|
      result = Daon.verify(protection.content_hash)
      
      if result.verified
        puts "✅ Verified: #{protection.work.title}"
      else
        puts "❌ Not verified: #{protection.work.title}"
      end
    end
  end
end
```

---

## 📊 Admin Features

### Admin Dashboard Stats

Add to admin dashboard:
```ruby
# In admin controller
def daon_stats
  @stats = {
    total_protected: DaonProtection.count,
    verified_protections: DaonProtection.verified.count,
    users_opted_in: User.joins(:preference).where(preferences: { enable_daon_protection: true }).count,
    licenses: DaonProtection.group(:license).count
  }
end
```

Display in admin view:
```erb
<div class="admin-stats">
  <h3>DAON Protection Stats</h3>
  <ul>
    <li>Protected Works: <%= @stats[:total_protected] %></li>
    <li>Verified Protections: <%= @stats[:verified_protections] %></li>
    <li>Users Opted In: <%= @stats[:users_opted_in] %></li>
    <li>Liberation Licensed: <%= @stats[:licenses]['liberation_v1'] || 0 %></li>
  </ul>
</div>
```

---

## 🎨 CSS Styling

Add basic styles (`app/assets/stylesheets/daon.css`):
```css
/* DAON Protection Styles */
.daon-protection {
  margin: 0.5rem 0;
}

.daon-protection .protected {
  color: #2d5a27;
  font-weight: bold;
}

.daon-protection .unprotected {
  color: #b5770d;
  font-weight: bold;
}

.daon-protection .note {
  font-size: 0.85em;
  color: #666;
  margin-top: 0.25rem;
}

.daon-protection a {
  color: #003399;
  text-decoration: underline;
}

/* Admin stats */
.admin-stats {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.admin-stats ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.admin-stats li {
  padding: 0.25rem 0;
}
```

---

## 🧪 Testing

### RSpec Tests

Create spec file (`spec/models/work_spec.rb` additions):
```ruby
describe "DAON protection" do
  let(:user) { create(:user) }
  let(:work) { create(:work, users: [user]) }
  
  before do
    user.preference.update!(enable_daon_protection: true)
  end
  
  it "protects work automatically when user opted in" do
    expect { work }.to change { DaonProtection.count }.by(1)
  end
  
  it "does not protect when user opted out" do
    user.preference.update!(enable_daon_protection: false)
    expect { work }.not_to change { DaonProtection.count }
  end
  
  it "uses correct license" do
    work
    expect(work.daon_protection.license).to eq('liberation_v1')
  end
end
```

### Integration Tests

Test the full flow:
```ruby
# spec/requests/daon_controller_spec.rb
describe "DAON verification API" do
  let(:work) { create(:work) }
  let!(:protection) { create(:daon_protection, work: work) }
  
  it "returns verification data for protected work" do
    get "/works/#{work.id}/daon/verify"
    
    expect(response).to be_successful
    json = JSON.parse(response.body)
    expect(json['verified']).to be true
    expect(json['license']).to eq(protection.license)
  end
end
```

---

## 🚀 Deployment Checklist

### Production Setup

1. **Environment Variables:**
   ```bash
   DAON_API_URL=https://api.daon.network
   ```

2. **Run Migrations:**
   ```bash
   rails db:migrate
   ```

3. **Update Existing Works (Optional):**
   ```bash
   rails daon:protect_existing
   ```

4. **Monitor Logs:**
   - Watch for DAON protection errors
   - Set up alerts for high failure rates

### Performance Considerations

- **Async Processing:** Consider using background jobs for large batches
- **Caching:** Cache verification results for frequently accessed works
- **Rate Limiting:** Built into SDK, but monitor API usage
- **Graceful Degradation:** Work creation never fails due to DAON issues

---

## 💡 Benefits for AO3

### For Creators
- **Automatic Protection:** Works protected as they're published
- **Legal Standing:** Cryptographic proof of ownership
- **AI Exploitation Prevention:** Liberation License blocks corporate training
- **No Extra Work:** Protection happens transparently

### For AO3
- **Enhanced Mission:** Leading creator protection technology
- **Community Value:** First platform offering built-in blockchain protection
- **Legal Safety:** Creators control their own rights
- **Future-Proof:** Ready for AI regulation compliance

### For the Community
- **45M+ Works Protected:** Existing archive can be bulk protected
- **Creator Empowerment:** Real tools to fight exploitation
- **Industry Leadership:** Setting standards for creator rights

---

## 📞 Support

### Technical Support
- **Documentation:** https://docs.daon.network/ruby
- **GitHub:** https://github.com/daon-network/ruby-sdk
- **API Status:** https://status.daon.network

### Integration Help
- **Email:** integration@daon.network
- **Discord:** [Creator protection community]
- **Emergency:** 24/7 support for production issues

---

## 🎯 Next Steps

1. **Test Integration:** Try on development environment
2. **User Communication:** Announce new protection features
3. **Gradual Rollout:** Enable for volunteer beta users first
4. **Community Feedback:** Gather input on license options and UI
5. **Full Launch:** Deploy to all users with celebration post

**Estimated Implementation Time:** 2-4 hours for basic integration, 1-2 days for full features.

**Ready to give creators the protection they deserve.** 🛡️
---
layout: default
title: "Bulk Protection Tool"
description: "Protect hundreds of existing creative works at once with DAON bulk protection"
---

# 📁 Bulk Protection Tool

**Protect hundreds of existing creative works at once with our command-line bulk protection tool.**

---

## 🚀 Quick Start

### 1. Download Tool
```bash
# Download the bulk protection script
wget https://github.com/daon-network/daon/raw/main/creator-tools/simple-bulk-protector.py

# Or clone the full repository
git clone https://github.com/daon-network/daon.git
cd daon/creator-tools/
```

### 2. Install Dependencies
```bash
# Install required Python packages
pip install requests beautifulsoup4

# Or use requirements file
pip install -r requirements.txt
```

### 3. Protect Your Works
```bash
# Basic usage - protect all files in a directory
python simple-bulk-protector.py my_works/

# With options
python simple-bulk-protector.py my_works/ --license liberation_v1 --dry-run
```

---

## 📂 Supported File Types

### **Text Formats**
- ✅ **Plain text** (`.txt`) - Stories, articles, poems
- ✅ **Markdown** (`.md`) - Documentation, blog posts  
- ✅ **HTML** (`.html`) - Web content, formatted text
- ✅ **RTF** (`.rtf`) - Rich text documents

### **Document Formats**
- ✅ **Word documents** (`.docx`) - Extracts text content
- ✅ **PDF files** (`.pdf`) - Text extraction supported
- ✅ **OpenDocument** (`.odt`) - LibreOffice documents

### **Data Exports**
- ✅ **JSON files** - Platform exports (AO3, etc.)
- ✅ **XML files** - Structured content exports
- ✅ **CSV files** - Spreadsheet data with content
- ✅ **EPUB files** - E-book format support

---

## 🎯 Use Cases

### **AO3 Fanfiction Writers**
```bash
# 1. Request data download from AO3
#    (Account → Privacy → Request Data)

# 2. Extract the downloaded archive
unzip ao3_works_export.zip

# 3. Protect all your works
python simple-bulk-protector.py ao3_works/ --format json --license liberation_v1

# Result: All fanfics protected in minutes
```

### **WordPress Bloggers**  
```bash
# 1. Export from WordPress
#    (WP Admin → Tools → Export → All Content)

# 2. Convert XML to readable format
python simple-bulk-protector.py wordpress_export.xml --format wordpress

# 3. Protect all posts
# Result: Entire blog history protected
```

### **Academic Researchers**
```bash
# 1. Organize your papers
mkdir research_papers/
cp *.pdf research_papers/

# 2. Protect with academic license
python simple-bulk-protector.py research_papers/ --license cc_by_nc

# Result: Research portfolio protected
```

### **Social Media Archives**
```bash
# 1. Export your content
#    (Twitter: Settings → Download archive)
#    (Reddit: User Settings → Data Export)

# 2. Extract and protect
python simple-bulk-protector.py social_exports/ --format mixed

# Result: Social content protected with timestamps
```

---

## 🛠️ Command Line Options

### **Basic Usage**
```bash
python simple-bulk-protector.py [directory] [options]
```

### **All Available Options**
```bash
--license TYPE          # Choose protection license
                       # Options: liberation_v1, cc_by_nc, all_rights, cc_by
                       # Default: liberation_v1

--dry-run              # Test mode - don't actually protect
                       # Shows what would be protected

--format FORMAT        # Input format detection
                       # Options: auto, text, json, xml, wordpress, ao3
                       # Default: auto

--recursive            # Include subdirectories
                       # Default: true

--filter PATTERN       # Only protect files matching pattern
                       # Example: --filter "*.txt"

--exclude PATTERN      # Skip files matching pattern
                       # Example: --exclude "draft_*"

--output FILE          # Save protection results to file
                       # Default: protection_results.json

--verify               # Verify protection after each file
                       # Default: false (faster without)

--threads NUM          # Number of concurrent protections
                       # Default: 3 (API rate limiting)

--api-key KEY          # Use custom API key
                       # Default: reads from DAON_API_KEY env var
```

### **Examples**
```bash
# Dry run to see what would be protected
python simple-bulk-protector.py my_works/ --dry-run

# Protect only text files with Liberation License
python simple-bulk-protector.py stories/ --filter "*.txt" --license liberation_v1

# Protect recursively but exclude drafts
python simple-bulk-protector.py writing/ --recursive --exclude "draft_*"

# Fast protection with verification
python simple-bulk-protector.py papers/ --threads 5 --verify

# Custom output file
python simple-bulk-protector.py content/ --output my_protection_log.json
```

---

## 📊 Progress Tracking

### **Real-time Progress**
```
🛡️ DAON Bulk Protection Tool

Scanning directory: my_works/
Found 847 files to protect

Progress: [████████████████████████████████] 100%
Protected: 847/847 files
Failed: 0 files
Time: 3m 42s

✅ Bulk protection complete!
📄 Results saved to: protection_results.json
```

### **Error Handling**
```
⚠️  Warning: File too large (skipped): huge_novel.txt
❌ Error: API rate limit exceeded (retrying in 60s)
✅ Retry successful: previous_file.md
```

### **Results Summary**
```json
{
  "summary": {
    "total_files": 847,
    "protected": 845,
    "failed": 2,
    "skipped": 0,
    "duration": "3m 42s"
  },
  "protection_details": [
    {
      "file": "story1.txt",
      "status": "protected",
      "hash": "7f8b9c2d...",
      "verification_url": "https://verify.daon.network/...",
      "license": "liberation_v1"
    }
  ]
}
```

---

## 🔧 Advanced Features

### **Custom Metadata Extraction**
```python
# For developers: customize metadata extraction
def extract_metadata(filepath):
    return {
        'title': extract_title_from_file(filepath),
        'author': get_author_from_path(filepath),
        'tags': parse_tags_from_content(filepath),
        'series': detect_series_info(filepath)
    }
```

### **Platform-Specific Parsers**
```python
# Built-in parsers for major platforms
parsers = {
    'ao3': parse_ao3_export,      # AO3 JSON format
    'ffn': parse_ffn_export,      # FFN data exports  
    'wattpad': parse_wattpad,     # Wattpad exports
    'wordpress': parse_wp_xml,    # WordPress XML
    'medium': parse_medium,       # Medium exports
    'ghost': parse_ghost_json,    # Ghost JSON
}
```

### **License Templates**
```json
{
  "liberation_v1": "Liberation License v1.0 - Blocks AI training",
  "cc_by_nc": "Creative Commons Attribution-NonCommercial",
  "cc_by_sa": "Creative Commons Attribution-ShareAlike",
  "cc_by": "Creative Commons Attribution",
  "all_rights": "All Rights Reserved"
}
```

---

## 📋 Platform Integration

### **AO3 Data Export**
```bash
# 1. Request AO3 data (takes 24-48 hours)
#    Account → Privacy → Request Data

# 2. Download when ready (email notification)

# 3. Extract and protect
unzip ao3_data.zip
python simple-bulk-protector.py ao3_data/ --format ao3

# Automatically extracts:
# ├── Work titles and summaries
# ├── Chapter content  
# ├── Tags and metadata
# ├── Publication dates
# └── Work relationships
```

### **WordPress Export**
```bash
# 1. Export from WordPress admin
#    Tools → Export → All Content → Download

# 2. Protect WordPress content  
python simple-bulk-protector.py wordpress.xml --format wordpress

# Extracts:
# ├── Post titles and content
# ├── Page content
# ├── Author information
# ├── Publication dates
# └── Custom post types
```

### **Social Media Archives**
```bash
# Twitter Archive
python simple-bulk-protector.py twitter_archive/data/tweet.js --format twitter

# Reddit Export  
python simple-bulk-protector.py reddit_comments.csv --format reddit

# Extracts:
# ├── Tweet/post content
# ├── Creation timestamps  
# ├── Engagement metrics
# └── Thread relationships
```

---

## 🔍 FAQ

### **"How long does bulk protection take?"**
Approximately 1-3 seconds per file, depending on size. 1000 files ≈ 30-60 minutes.

### **"What if protection fails for some files?"**
Failed protections are logged and can be retried. Common causes: file corruption, network issues, API limits.

### **"Can I pause and resume?"**
Yes. The tool creates checkpoint files and can resume from where it left off.

### **"Does this count against API limits?"**
Yes. Free tier: 1000 protections/month. Upgrade available for larger collections.

### **"What about very large files?"**
Files over 10MB are automatically split into chunks or skipped (configurable).

### **"Can I protect the same content multiple times?"**
The tool detects duplicates and skips already-protected content unless forced.

---

## 📊 Success Stories

### **Fanfiction Writer**
> *"Protected 847 fanfics in 20 minutes. Five years of writing now has blockchain proof of ownership before any AI training."*

### **Academic Researcher**  
> *"Bulk protected my entire research portfolio - 156 papers. When a company used my work without permission, I had timestamped evidence."*

### **Blogger**
> *"Protected 1,200 blog posts from 10 years of writing. The peace of mind is incredible."*

### **Artist**
> *"Used it to protect all my story commissions and original fiction. Clients love that their commissioned work is blockchain-protected."*

---

## 📥 Download & Setup

<div class="download-section">

**[📥 Download Tool](https://github.com/daon-network/daon/raw/main/creator-tools/simple-bulk-protector.py)**

**[📖 Full Documentation](https://github.com/daon-network/daon/tree/main/creator-tools)**

**[💬 Get Support](https://discord.gg/daon)**

**[🐛 Report Issues](https://github.com/daon-network/daon/issues)**

</div>

---

**Protect your entire creative portfolio today. Every protected work is a victory against exploitation.** 🛡️
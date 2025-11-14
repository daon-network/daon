#!/usr/bin/env python3
"""
DAON Bulk Protection Tool
=========================

Protect large numbers of existing works at once.
Perfect for creators migrating from unprotected platforms.

Usage:
    python bulk-protection-script.py --source ao3_export.json
    python bulk-protection-script.py --source wordpress_export.xml
    python bulk-protection-script.py --source fanfiction_folder/
    python bulk-protection-script.py --source urls.txt

Features:
- Import from AO3 exports, WordPress exports, file folders, URL lists
- Automatic content extraction and metadata parsing
- Batch processing with rate limiting
- Progress tracking and error recovery
- License selection and creator verification
- Dry-run mode for testing
"""

import argparse
import json
import xml.etree.ElementTree as ET
import os
import sys
import time
import hashlib
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup


@dataclass
class Work:
    """Represents a creative work to be protected."""
    title: str
    content: str
    author: Optional[str] = None
    url: Optional[str] = None
    published_date: Optional[str] = None
    tags: List[str] = None
    fandoms: List[str] = None
    characters: List[str] = None
    word_count: Optional[int] = None
    source_platform: Optional[str] = None
    original_id: Optional[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.fandoms is None:
            self.fandoms = []
        if self.characters is None:
            self.characters = []
        if self.word_count is None:
            self.word_count = len(self.content.split())


class BulkProtectionTool:
    """Tool for bulk protecting existing creative works."""
    
    def __init__(self, api_url: str = "https://api.daon.network", dry_run: bool = False):
        self.api_url = api_url
        self.dry_run = dry_run
        self.protected_count = 0
        self.error_count = 0
        self.skipped_count = 0
        self.results: List[Dict[str, Any]] = []
        
    def protect_from_source(self, source_path: str, license_type: str = "liberation_v1"):
        """Main entry point - detect source type and process accordingly."""
        print(f"🛡️ DAON Bulk Protection Tool")
        print(f"Source: {source_path}")
        print(f"License: {license_type}")
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE PROTECTION'}")
        print("-" * 60)
        
        if source_path.endswith('.json'):
            works = self.parse_ao3_export(source_path)
        elif source_path.endswith('.xml'):
            works = self.parse_wordpress_export(source_path)
        elif source_path.endswith('.txt'):
            works = self.parse_url_list(source_path)
        elif os.path.isdir(source_path):
            works = self.parse_file_directory(source_path)
        else:
            print(f"❌ Unsupported source type: {source_path}")
            return
        
        print(f"📚 Found {len(works)} works to protect")
        
        if not works:
            print("No works found. Exiting.")
            return
            
        # Show preview
        self.show_preview(works[:3])
        
        if not self.dry_run:
            confirm = input(f"\n🔒 Protect {len(works)} works with {license_type} license? (y/N): ")
            if confirm.lower() != 'y':
                print("Protection cancelled.")
                return
        
        # Process works
        self.process_works(works, license_type)
        self.show_summary()
    
    def parse_ao3_export(self, file_path: str) -> List[Work]:
        """Parse AO3 data export JSON."""
        print(f"📖 Parsing AO3 export: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            works = []
            
            # Handle different AO3 export formats
            if isinstance(data, list):
                # Direct list of works
                work_list = data
            elif 'works' in data:
                # Wrapped in works key
                work_list = data['works']
            else:
                print("❌ Unrecognized AO3 export format")
                return []
            
            for work_data in work_list:
                try:
                    work = Work(
                        title=work_data.get('title', 'Untitled'),
                        content=self.extract_ao3_content(work_data),
                        author=self.extract_ao3_author(work_data),
                        url=work_data.get('url') or work_data.get('link'),
                        published_date=work_data.get('published') or work_data.get('date'),
                        tags=work_data.get('tags', []) + work_data.get('additional_tags', []),
                        fandoms=work_data.get('fandoms', []),
                        characters=work_data.get('characters', []),
                        source_platform='ao3',
                        original_id=str(work_data.get('id', ''))
                    )
                    
                    if self.is_valid_work(work):
                        works.append(work)
                    else:
                        print(f"⚠️ Skipping invalid work: {work.title}")
                        
                except Exception as e:
                    print(f"❌ Error parsing work: {e}")
                    continue
            
            return works
            
        except Exception as e:
            print(f"❌ Error reading AO3 export: {e}")
            return []
    
    def parse_wordpress_export(self, file_path: str) -> List[Work]:
        """Parse WordPress WXR export file."""
        print(f"📝 Parsing WordPress export: {file_path}")
        
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
            
            # Find namespace
            ns = {'wp': 'http://wordpress.org/export/1.2/'}
            if not root.findall('.//wp:post_type', ns):
                # Try without namespace for older exports
                ns = {}
            
            works = []
            
            for item in root.findall('.//item'):
                try:
                    # Skip non-post items
                    post_type = item.find('wp:post_type', ns)
                    if post_type is not None and post_type.text not in ['post', 'page']:
                        continue
                    
                    # Skip non-published posts
                    status = item.find('wp:status', ns)
                    if status is not None and status.text != 'publish':
                        continue
                    
                    title = item.find('title').text or 'Untitled'
                    content_elem = item.find('content:encoded', {'content': 'http://purl.org/rss/1.0/modules/content/'})
                    content = content_elem.text if content_elem is not None else ''
                    
                    # Clean HTML from content
                    if content:
                        soup = BeautifulSoup(content, 'html.parser')
                        content = soup.get_text()
                    
                    # Extract metadata
                    author = item.find('dc:creator', {'dc': 'http://purl.org/dc/elements/1.1/'})
                    pub_date = item.find('pubDate')
                    link = item.find('link')
                    
                    # Extract categories/tags
                    categories = []
                    tags = []
                    for category in item.findall('category'):
                        domain = category.get('domain', '')
                        if domain == 'post_tag':
                            tags.append(category.text)
                        elif domain == 'category':
                            categories.append(category.text)
                    
                    work = Work(
                        title=title,
                        content=content,
                        author=author.text if author is not None else None,
                        url=link.text if link is not None else None,
                        published_date=pub_date.text if pub_date is not None else None,
                        tags=tags + categories,
                        source_platform='wordpress',
                        original_id=item.find('wp:post_id', ns).text if item.find('wp:post_id', ns) is not None else None
                    )
                    
                    if self.is_valid_work(work):
                        works.append(work)
                        
                except Exception as e:
                    print(f"❌ Error parsing WordPress item: {e}")
                    continue
            
            return works
            
        except Exception as e:
            print(f"❌ Error reading WordPress export: {e}")
            return []
    
    def parse_url_list(self, file_path: str) -> List[Work]:
        """Parse list of URLs to scrape and protect."""
        print(f"🔗 Parsing URL list: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
            
            works = []
            
            for url in urls:
                print(f"  📄 Fetching: {url}")
                try:
                    work = self.scrape_url(url)
                    if work and self.is_valid_work(work):
                        works.append(work)
                    else:
                        print(f"    ❌ Could not extract content")
                        
                except Exception as e:
                    print(f"    ❌ Error: {e}")
                    continue
                
                # Rate limiting for scraping
                time.sleep(1)
            
            return works
            
        except Exception as e:
            print(f"❌ Error reading URL list: {e}")
            return []
    
    def parse_file_directory(self, dir_path: str) -> List[Work]:
        """Parse directory of text files."""
        print(f"📁 Parsing directory: {dir_path}")
        
        works = []
        
        text_files = list(Path(dir_path).glob('**/*.txt')) + list(Path(dir_path).glob('**/*.md'))
        
        for file_path in text_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Try to extract title from first line or filename
                lines = content.split('\n')
                title = lines[0].strip() if lines and len(lines[0].strip()) < 100 else file_path.stem
                
                # Remove title from content if it was first line
                if lines and lines[0].strip() == title:
                    content = '\n'.join(lines[1:]).strip()
                
                work = Work(
                    title=title,
                    content=content,
                    source_platform='file',
                    original_id=str(file_path)
                )
                
                if self.is_valid_work(work):
                    works.append(work)
                    
            except Exception as e:
                print(f"❌ Error reading {file_path}: {e}")
                continue
        
        return works
    
    def scrape_url(self, url: str) -> Optional[Work]:
        """Scrape content from a URL."""
        try:
            headers = {
                'User-Agent': 'DAON Bulk Protection Tool 1.0'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extract title
            title_elem = soup.find('title')
            title = title_elem.text.strip() if title_elem else 'Untitled'
            
            # Extract content - try common content selectors
            content_selectors = [
                'article',
                '.post-content',
                '.entry-content', 
                '.content',
                'main',
                '#content',
                '.story-text',  # FanFiction.Net
                '#workskin',    # AO3
                '.userstuff'    # AO3
            ]
            
            content = ''
            for selector in content_selectors:
                content_elem = soup.select_one(selector)
                if content_elem:
                    content = content_elem.get_text()
                    break
            
            # Fallback to body text
            if not content:
                content = soup.get_text()
            
            # Clean up content
            content = re.sub(r'\s+', ' ', content).strip()
            
            # Extract author if possible
            author_selectors = [
                '.author',
                '.byline', 
                '[rel="author"]',
                '.post-author'
            ]
            
            author = None
            for selector in author_selectors:
                author_elem = soup.select_one(selector)
                if author_elem:
                    author = author_elem.get_text().strip()
                    break
            
            return Work(
                title=title,
                content=content,
                author=author,
                url=url,
                source_platform=urlparse(url).netloc
            )
            
        except Exception as e:
            raise Exception(f"Failed to scrape {url}: {e}")
    
    def extract_ao3_content(self, work_data: Dict) -> str:
        """Extract content from AO3 work data."""
        # Try different possible content fields
        content_fields = ['content', 'body', 'text', 'chapters', 'summary']
        
        for field in content_fields:
            if field in work_data and work_data[field]:
                content = work_data[field]
                
                # If chapters, combine them
                if isinstance(content, list):
                    content = '\n\n'.join(str(chapter) for chapter in content)
                
                return str(content)
        
        return ''
    
    def extract_ao3_author(self, work_data: Dict) -> Optional[str]:
        """Extract author from AO3 work data."""
        author_fields = ['author', 'authors', 'creator', 'creators']
        
        for field in author_fields:
            if field in work_data and work_data[field]:
                authors = work_data[field]
                
                if isinstance(authors, list):
                    return ', '.join(str(author) for author in authors)
                else:
                    return str(authors)
        
        return None
    
    def is_valid_work(self, work: Work) -> bool:
        """Check if work is valid for protection."""
        if not work.title or not work.content:
            return False
        
        if len(work.content.strip()) < 100:  # Too short
            return False
            
        if len(work.content) > 10 * 1024 * 1024:  # Too long (>10MB)
            return False
        
        return True
    
    def show_preview(self, works: List[Work]):
        """Show preview of works to be protected."""
        print("\n📋 Preview of works to be protected:")
        print("-" * 60)
        
        for i, work in enumerate(works, 1):
            print(f"{i}. {work.title}")
            print(f"   Author: {work.author or 'Unknown'}")
            print(f"   Words: {work.word_count:,}")
            print(f"   Source: {work.source_platform}")
            if work.fandoms:
                print(f"   Fandoms: {', '.join(work.fandoms[:3])}")
            print()
        
        if len(works) > 3:
            print(f"... and {len(works) - 3} more works")
    
    def process_works(self, works: List[Work], license_type: str):
        """Process and protect all works."""
        print(f"\n🔒 {'Simulating' if self.dry_run else 'Protecting'} {len(works)} works...")
        print("-" * 60)
        
        for i, work in enumerate(works, 1):
            print(f"[{i}/{len(works)}] {work.title[:50]}...")
            
            try:
                if self.dry_run:
                    # Simulate protection
                    time.sleep(0.1)  # Simulate API call
                    result = self.simulate_protection(work, license_type)
                else:
                    result = self.protect_work(work, license_type)
                
                if result['success']:
                    self.protected_count += 1
                    print(f"  ✅ Protected: {result.get('content_hash', '')[:16]}...")
                else:
                    self.error_count += 1
                    print(f"  ❌ Failed: {result.get('error', 'Unknown error')}")
                
                self.results.append({
                    'work': work,
                    'result': result
                })
                
                # Rate limiting
                time.sleep(0.5)
                
            except KeyboardInterrupt:
                print("\n⏹️ Protection interrupted by user")
                break
            except Exception as e:
                self.error_count += 1
                print(f"  ❌ Exception: {e}")
                continue
    
    def simulate_protection(self, work: Work, license_type: str) -> Dict[str, Any]:
        """Simulate protection for dry run."""
        content_hash = hashlib.sha256(work.content.encode()).hexdigest()
        
        return {
            'success': True,
            'content_hash': f"sha256:{content_hash}",
            'tx_hash': f"sim-{int(time.time())}",
            'verification_url': f"https://verify.daon.network/sha256:{content_hash}",
            'simulated': True
        }
    
    def protect_work(self, work: Work, license_type: str) -> Dict[str, Any]:
        """Actually protect work via DAON API."""
        try:
            # Generate content hash
            content_hash = hashlib.sha256(work.content.encode()).hexdigest()
            
            # Prepare API payload
            payload = {
                'content_hash': f"sha256:{content_hash}",
                'creator': 'bulk-protection-tool',  # Would be actual creator ID
                'license': license_type,
                'platform': work.source_platform or 'bulk-import',
                'metadata': {
                    'title': work.title,
                    'author': work.author,
                    'word_count': work.word_count,
                    'url': work.url,
                    'published_date': work.published_date,
                    'tags': work.tags,
                    'fandoms': work.fandoms,
                    'characters': work.characters,
                    'original_id': work.original_id
                }
            }
            
            # Make API call
            response = requests.post(
                f"{self.api_url}/api/v1/protect",
                json=payload,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'DAON-Bulk-Protection-Tool/1.0'
                },
                timeout=30
            )
            
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def show_summary(self):
        """Show protection summary."""
        print("\n" + "="*60)
        print("🛡️ DAON BULK PROTECTION SUMMARY")
        print("="*60)
        print(f"✅ Successfully protected: {self.protected_count}")
        print(f"❌ Failed to protect: {self.error_count}")
        print(f"📊 Total processed: {len(self.results)}")
        
        if self.error_count > 0:
            print(f"\n❌ ERRORS:")
            for result in self.results:
                if not result['result']['success']:
                    print(f"  - {result['work'].title}: {result['result'].get('error', 'Unknown error')}")
        
        if self.dry_run:
            print(f"\n🧪 This was a DRY RUN - no actual protection occurred")
            print(f"Remove --dry-run flag to actually protect these works")
        else:
            print(f"\n🎉 Protection complete! Your works are now secured by DAON blockchain.")
            print(f"You can verify protection at: https://verify.daon.network")


def main():
    parser = argparse.ArgumentParser(
        description='DAON Bulk Protection Tool - Protect existing creative works in bulk',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python bulk-protection-script.py --source my_ao3_export.json
  python bulk-protection-script.py --source wordpress_export.xml --license cc_by_nc
  python bulk-protection-script.py --source fanfics/ --dry-run
  python bulk-protection-script.py --source urls.txt --api-url http://localhost:1317
        """
    )
    
    parser.add_argument(
        '--source', 
        required=True,
        help='Source to import from: JSON file (AO3), XML file (WordPress), directory (files), or TXT file (URLs)'
    )
    
    parser.add_argument(
        '--license',
        default='liberation_v1',
        choices=['liberation_v1', 'cc_by_nc', 'cc_by_nc_sa', 'all_rights_reserved'],
        help='License type for protection (default: liberation_v1)'
    )
    
    parser.add_argument(
        '--api-url',
        default='https://api.daon.network',
        help='DAON API URL (default: https://api.daon.network)'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Test run without actually protecting works'
    )
    
    args = parser.parse_args()
    
    # Validate source exists
    if not os.path.exists(args.source):
        print(f"❌ Source not found: {args.source}")
        sys.exit(1)
    
    # Create protection tool
    tool = BulkProtectionTool(api_url=args.api_url, dry_run=args.dry_run)
    
    # Run protection
    tool.protect_from_source(args.source, args.license)


if __name__ == '__main__':
    main()
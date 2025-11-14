#!/usr/bin/env python3
"""
DAON Simple Bulk Protection Tool
================================

Protect multiple text files or exported content at once.
No external dependencies required - uses only Python standard library.

Usage:
    python simple-bulk-protector.py folder_of_files/
    python simple-bulk-protector.py my_export.json
    python simple-bulk-protector.py --help

Features:
- Process folders of .txt/.md files
- Handle JSON exports (AO3 format)
- Automatic content hashing
- Rate limiting and error handling
- Dry-run mode for testing
- Progress tracking
"""

import argparse
import json
import os
import sys
import time
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Optional, Any


@dataclass
class Work:
    """Represents a creative work to be protected."""
    title: str
    content: str
    author: str = "Unknown"
    word_count: int = 0
    source_file: str = ""
    
    def __post_init__(self):
        if self.word_count == 0:
            self.word_count = len(self.content.split())


class SimpleBulkProtector:
    """Simple bulk protection tool using only standard library."""
    
    def __init__(self, api_url: str = "https://api.daon.network", dry_run: bool = False):
        self.api_url = api_url
        self.dry_run = dry_run
        self.protected_count = 0
        self.error_count = 0
        self.results: List[Dict[str, Any]] = []
    
    def protect_from_source(self, source_path: str, license_type: str = "liberation_v1"):
        """Main entry point."""
        print(f"🛡️ DAON Simple Bulk Protection Tool")
        print(f"Source: {source_path}")
        print(f"License: {license_type}")
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE PROTECTION'}")
        print("-" * 50)
        
        # Determine source type and parse
        if os.path.isfile(source_path):
            if source_path.endswith('.json'):
                works = self.parse_json_export(source_path)
            elif source_path.endswith(('.txt', '.md')):
                works = [self.parse_single_file(source_path)]
            else:
                print(f"❌ Unsupported file type: {source_path}")
                return
        elif os.path.isdir(source_path):
            works = self.parse_directory(source_path)
        else:
            print(f"❌ Source not found: {source_path}")
            return
        
        works = [w for w in works if w is not None]  # Filter out None values
        
        if not works:
            print("No valid works found.")
            return
        
        print(f"📚 Found {len(works)} works to protect")
        self.show_preview(works[:3])
        
        if not self.dry_run:
            confirm = input(f"\n🔒 Protect {len(works)} works? (y/N): ")
            if confirm.lower() != 'y':
                print("Protection cancelled.")
                return
        
        self.process_works(works, license_type)
        self.show_summary()
    
    def parse_json_export(self, file_path: str) -> List[Work]:
        """Parse JSON export (e.g., from AO3)."""
        print(f"📖 Parsing JSON export: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            works = []
            
            # Handle different JSON structures
            if isinstance(data, list):
                work_list = data
            elif isinstance(data, dict) and 'works' in data:
                work_list = data['works']
            else:
                # Treat as single work
                work_list = [data]
            
            for work_data in work_list:
                try:
                    title = work_data.get('title', 'Untitled')
                    content = self.extract_content(work_data)
                    author = self.extract_author(work_data)
                    
                    if content and len(content.strip()) > 50:
                        work = Work(
                            title=title,
                            content=content,
                            author=author,
                            source_file=file_path
                        )
                        works.append(work)
                
                except Exception as e:
                    print(f"⚠️ Skipping invalid work: {e}")
                    continue
            
            return works
            
        except Exception as e:
            print(f"❌ Error parsing JSON: {e}")
            return []
    
    def parse_single_file(self, file_path: str) -> Optional[Work]:
        """Parse a single text/markdown file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            
            if len(content) < 50:
                print(f"⚠️ Skipping short file: {file_path}")
                return None
            
            # Try to extract title from first line
            lines = content.split('\n')
            first_line = lines[0].strip()
            
            if len(first_line) < 100 and not first_line.endswith('.'):
                # Likely a title
                title = first_line
                content = '\n'.join(lines[1:]).strip()
            else:
                # Use filename as title
                title = Path(file_path).stem
            
            return Work(
                title=title,
                content=content,
                source_file=file_path
            )
            
        except Exception as e:
            print(f"❌ Error reading {file_path}: {e}")
            return None
    
    def parse_directory(self, dir_path: str) -> List[Work]:
        """Parse all text files in a directory."""
        print(f"📁 Parsing directory: {dir_path}")
        
        works = []
        text_extensions = {'.txt', '.md', '.rst', '.text'}
        
        for file_path in Path(dir_path).rglob('*'):
            if file_path.suffix.lower() in text_extensions:
                work = self.parse_single_file(str(file_path))
                if work:
                    works.append(work)
        
        return works
    
    def extract_content(self, work_data: dict) -> str:
        """Extract content from work data dictionary."""
        # Try common content fields
        content_fields = ['content', 'body', 'text', 'chapters', 'story']
        
        for field in content_fields:
            if field in work_data and work_data[field]:
                content = work_data[field]
                
                if isinstance(content, list):
                    # Join chapters or parts
                    content = '\n\n'.join(str(part) for part in content)
                
                return str(content).strip()
        
        return ""
    
    def extract_author(self, work_data: dict) -> str:
        """Extract author from work data dictionary."""
        author_fields = ['author', 'authors', 'creator', 'user', 'by']
        
        for field in author_fields:
            if field in work_data and work_data[field]:
                author = work_data[field]
                
                if isinstance(author, list):
                    return ', '.join(str(a) for a in author)
                else:
                    return str(author)
        
        return "Unknown"
    
    def show_preview(self, works: List[Work]):
        """Show preview of works to be protected."""
        print("\n📋 Preview:")
        print("-" * 50)
        
        for i, work in enumerate(works, 1):
            print(f"{i}. {work.title}")
            print(f"   Author: {work.author}")
            print(f"   Words: {work.word_count:,}")
            print(f"   File: {Path(work.source_file).name}")
            print()
        
        if len(works) > 3:
            print(f"... and {len(works) - 3} more works")
    
    def process_works(self, works: List[Work], license_type: str):
        """Process and protect all works."""
        print(f"\n🔒 {'Simulating' if self.dry_run else 'Protecting'} {len(works)} works...")
        print("-" * 50)
        
        for i, work in enumerate(works, 1):
            title_preview = work.title[:40] + "..." if len(work.title) > 40 else work.title
            print(f"[{i}/{len(works)}] {title_preview}")
            
            try:
                if self.dry_run:
                    result = self.simulate_protection(work, license_type)
                else:
                    result = self.protect_work(work, license_type)
                
                if result['success']:
                    self.protected_count += 1
                    hash_preview = result.get('content_hash', '')[:16] + "..."
                    print(f"  ✅ Protected: {hash_preview}")
                else:
                    self.error_count += 1
                    print(f"  ❌ Failed: {result.get('error', 'Unknown error')}")
                
                self.results.append({
                    'work': work,
                    'result': result
                })
                
                # Rate limiting
                time.sleep(0.2)
                
            except KeyboardInterrupt:
                print("\n⏹️ Protection interrupted by user")
                break
            except Exception as e:
                self.error_count += 1
                print(f"  ❌ Exception: {e}")
                continue
    
    def simulate_protection(self, work: Work, license_type: str) -> Dict[str, Any]:
        """Simulate protection for dry run."""
        content_hash = hashlib.sha256(work.content.encode('utf-8')).hexdigest()
        
        return {
            'success': True,
            'content_hash': f"sha256:{content_hash}",
            'tx_hash': f"sim-{int(time.time())}",
            'simulated': True
        }
    
    def protect_work(self, work: Work, license_type: str) -> Dict[str, Any]:
        """Protect work via DAON API."""
        try:
            # Generate content hash
            content_hash = hashlib.sha256(work.content.encode('utf-8')).hexdigest()
            
            # Prepare payload
            payload = {
                'content_hash': f"sha256:{content_hash}",
                'creator': 'bulk-protection-user',
                'license': license_type,
                'platform': 'bulk-import',
                'metadata': {
                    'title': work.title,
                    'author': work.author,
                    'word_count': work.word_count,
                    'source_file': work.source_file
                }
            }
            
            # Make HTTP request
            data = json.dumps(payload).encode('utf-8')
            
            req = urllib.request.Request(
                f"{self.api_url}/api/v1/protect",
                data=data,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'DAON-Simple-Bulk-Protector/1.0'
                }
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode('utf-8'))
                return result
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def show_summary(self):
        """Show protection summary."""
        print("\n" + "="*50)
        print("🛡️ PROTECTION SUMMARY")
        print("="*50)
        print(f"✅ Protected: {self.protected_count}")
        print(f"❌ Failed: {self.error_count}")
        print(f"📊 Total: {len(self.results)}")
        
        if self.error_count > 0:
            print(f"\n❌ Errors occurred:")
            for result in self.results[-5:]:  # Show last 5 errors
                if not result['result']['success']:
                    title = result['work'].title[:30]
                    error = result['result'].get('error', 'Unknown')
                    print(f"  - {title}: {error}")
        
        if self.dry_run:
            print(f"\n🧪 This was a dry run - no actual protection")
            print(f"Remove --dry-run to actually protect works")
        else:
            print(f"\n🎉 Protection complete!")
        
        # Save results
        if self.results:
            results_file = f"daon_protection_results_{int(time.time())}.json"
            try:
                with open(results_file, 'w') as f:
                    # Convert results to serializable format
                    serializable_results = []
                    for r in self.results:
                        serializable_results.append({
                            'title': r['work'].title,
                            'author': r['work'].author,
                            'word_count': r['work'].word_count,
                            'source_file': r['work'].source_file,
                            'result': r['result']
                        })
                    json.dump(serializable_results, f, indent=2)
                print(f"📄 Results saved to: {results_file}")
            except Exception as e:
                print(f"⚠️ Could not save results: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='DAON Simple Bulk Protection Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python simple-bulk-protector.py my_stories/
  python simple-bulk-protector.py export.json --dry-run
  python simple-bulk-protector.py story.txt --license cc_by_nc
        """
    )
    
    parser.add_argument(
        'source',
        help='Source to protect: file or directory'
    )
    
    parser.add_argument(
        '--license',
        default='liberation_v1',
        choices=['liberation_v1', 'cc_by_nc', 'cc_by_nc_sa', 'all_rights_reserved'],
        help='License type (default: liberation_v1)'
    )
    
    parser.add_argument(
        '--api-url',
        default='https://api.daon.network',
        help='DAON API URL'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Test without actually protecting'
    )
    
    args = parser.parse_args()
    
    if not os.path.exists(args.source):
        print(f"❌ Source not found: {args.source}")
        sys.exit(1)
    
    tool = SimpleBulkProtector(api_url=args.api_url, dry_run=args.dry_run)
    tool.protect_from_source(args.source, args.license)


if __name__ == '__main__':
    main()
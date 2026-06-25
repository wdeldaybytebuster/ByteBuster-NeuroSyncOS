import sys
import json
import argparse
import traceback

def run_scrapling(url: str, headless: bool):
    try:
        # User explicitly requested Scrapling and Cloak. 
        # Scrapling uses stealth mechanics natively.
        from scrapling import StealthyFetcher
        
        # Cloak is often integrated or mimics human behavior.
        # Initialize Scrapling's StealthyFetcher with Garcon Bypass (Rule IV)
        fetcher = StealthyFetcher(
            headless=headless,
            executable_path='/usr/bin/google-chrome-beta'
        )
        
        page = fetcher.get(url)
        
        # For this MVP, we return the cleaned markdown or text
        # so that ScopeLogic LLM can easily ingest it.
        text_content = page.text_content()
        
        result = {
            "status": "success",
            "url": url,
            "title": page.title(),
            "content_length": len(text_content),
            "preview": text_content[:2000] # Return top 2k chars to avoid blowing up stdout/context limits
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "status": "error",
            "url": url,
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NeuroSync Scrapling Integration")
    parser.add_argument("--url", required=True, help="Target URL")
    parser.add_argument("--headless", action="store_true", help="Run in headless mode")
    
    args = parser.parse_args()
    run_scrapling(args.url, args.headless)

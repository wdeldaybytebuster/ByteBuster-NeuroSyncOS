import path from 'path';
import { CommandSandbox } from './sandbox';

export class StealthScraper {
  private sandbox: CommandSandbox;

  constructor(projectId?: string) {
    this.sandbox = new CommandSandbox(projectId);
  }

  /**
   * Executes a scrape using Scrapling and Cloak via the secure sandbox.
   * @param url The target URL
   * @param headless Whether to use a headless browser window
   */
  public async scrape(url: string, headless: boolean = true): Promise<any> {
    const scriptPath = path.resolve(__dirname, './python_scripts/scraper.py');
    
    // CommandSandbox only allows specific commands. "python3" is on the allowlist.
    const command = `python3 ${scriptPath} --url ${url}${headless ? ' --headless' : ''}`;
    
    try {
      const { stdout } = await this.sandbox.execute(command);
      return JSON.parse(stdout);
    } catch (err: any) {
      console.error('[StealthScraper] Error:', err.message);
      throw new Error(`Scraping failed: ${err.message}`);
    }
  }
}

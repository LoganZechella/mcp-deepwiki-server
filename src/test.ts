
import { DeepWikiService } from './services/deepwiki.js';
import { GitHubFallbackService } from './services/github-fallback.js';
import { Logger } from './utils/logger.js';

async function testServer() {
  const logger = new Logger();
  const deepwikiService = new DeepWikiService(logger);
  const githubFallback = new GitHubFallbackService(logger);

  console.log('Testing MCP DeepWiki Server...');

  // Test 1: DeepWiki fetch
  try {
    console.log('\n1. Testing DeepWiki fetch...');
    const result = await deepwikiService.fetchContent({
      url: 'facebook/react',
      mode: 'aggregate',
      maxDepth: 5,
      includeMetadata: true,
      contentFilter: 'all'
    });
    console.log('✅ DeepWiki fetch successful');
    console.log(`Content length: ${result.content?.length || 0} characters`);
  } catch (error) {
    console.log('❌ DeepWiki fetch failed:', (error as Error).message);
    
    // Test GitHub fallback
    try {
      console.log('Testing GitHub fallback...');
      const fallbackResult = await githubFallback.fetchContent({
        url: 'facebook/react',
        mode: 'aggregate',
        maxDepth: 5,
        includeMetadata: true,
        contentFilter: 'all'
      });
      console.log('✅ GitHub fallback successful');
      console.log(`Content length: ${fallbackResult.content?.length || 0} characters`);
    } catch (fallbackError) {
      console.log('❌ GitHub fallback also failed:', (fallbackError as Error).message);
    }
  }

  // Test 2: Search functionality
  try {
    console.log('\n2. Testing search functionality...');
    const searchResult = await deepwikiService.searchRepositories({
      query: 'react',
      limit: 5
    });
    console.log('✅ Search successful');
    console.log(`Found ${searchResult.length} repositories`);
  } catch (error) {
    console.log('❌ Search failed:', (error as Error).message);
  }

  // Test 3: Summary generation
  try {
    console.log('\n3. Testing summary generation...');
    const summary = await deepwikiService.generateSummary(
      'This is a test content for summary generation. It contains multiple sentences. Each sentence provides different information about the project.',
      'overview',
      500
    );
    console.log('✅ Summary generation successful');
    console.log(`Summary length: ${summary.length} characters`);
  } catch (error) {
    console.log('❌ Summary generation failed:', (error as Error).message);
  }

  console.log('\nTest completed!');
}

testServer().catch(console.error);


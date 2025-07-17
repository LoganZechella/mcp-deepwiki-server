
/**
 * Test script for the MCP DeepWiki Server
 * Tests the server functionality with the provided test repositories
 */

import { DeepWikiFetcher } from "./services/deepwiki-fetcher.js";
import { validateDeepWikiUrl } from "./utils/url-validator.js";
import { createLogger } from "./utils/logger.js";

const logger = createLogger("test");

// Test repositories from the requirements
const testRepos = [
  "https://deepwiki.com/modelcontextprotocol/typescript-sdk",
  "https://deepwiki.com/neka-nat/freecad-mcp",
  "https://deepwiki.com/openai/openai-agents-python",
  "modelcontextprotocol/typescript-sdk", // Test shorthand format
];

/**
 * Test URL validation
 */
async function testUrlValidation(): Promise<void> {
  logger.info("Testing URL validation...");
  
  for (const repo of testRepos) {
    try {
      const urlInfo = validateDeepWikiUrl(repo);
      logger.info(`✅ Valid URL: ${repo} -> ${urlInfo.owner}/${urlInfo.repo}`);
    } catch (error) {
      logger.error(`❌ Invalid URL: ${repo} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Test DeepWiki content fetching
 */
async function testContentFetching(): Promise<void> {
  logger.info("Testing content fetching...");
  
  const fetcher = new DeepWikiFetcher();
  
  // Test with the first repository
  const testRepo = testRepos[0];
  
  if (!testRepo) {
    logger.error("No test repository available");
    return;
  }
  
  try {
    logger.info(`Testing aggregate mode with: ${testRepo}`);
    const urlInfo = validateDeepWikiUrl(testRepo);
    
    // Test aggregate mode
    const aggregateResult = await fetcher.fetchAggregated(urlInfo, 2); // Limit depth for testing
    logger.info(`✅ Aggregate fetch successful: ${aggregateResult.pageCount} pages, ${aggregateResult.content?.length || 0} characters`);
    
    // Test pages mode
    logger.info(`Testing pages mode with: ${testRepo}`);
    const pagesResult = await fetcher.fetchPages(urlInfo, 2); // Limit depth for testing
    logger.info(`✅ Pages fetch successful: ${pagesResult.pageCount} pages`);
    
    if (pagesResult.pages && pagesResult.pages.length > 0) {
      const firstPage = pagesResult.pages[0];
      if (firstPage) {
        logger.info(`First page: "${firstPage.title}" (${firstPage.content.length} characters)`);
      }
    }
    
  } catch (error) {
    logger.error(`❌ Content fetching failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test tool input validation
 */
async function testToolValidation(): Promise<void> {
  logger.info("Testing tool input validation...");
  
  const testInputs = [
    { url: "https://deepwiki.com/modelcontextprotocol/typescript-sdk", mode: "aggregate" as const, maxDepth: 3 },
    { url: "neka-nat/freecad-mcp", mode: "pages" as const, maxDepth: 2 },
    { url: "invalid-url", mode: "aggregate" as const, maxDepth: 1 }, // Should fail
    { url: "https://evil.com/test/repo", mode: "aggregate" as const, maxDepth: 1 }, // Should fail domain check
  ];
  
  for (const input of testInputs) {
    try {
      logger.info(`Testing input: ${JSON.stringify(input)}`);
      
      // This simulates what the tool would do
      const urlInfo = validateDeepWikiUrl(input.url);
      logger.info(`✅ Input validation passed for: ${input.url}`);
      
    } catch (error) {
      logger.warn(`⚠️ Input validation failed for ${input.url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Main test function
 */
async function runTests(): Promise<void> {
  logger.info("🚀 Starting MCP DeepWiki Server tests...");
  
  try {
    await testUrlValidation();
    console.log();
    
    await testToolValidation();
    console.log();
    
    await testContentFetching();
    console.log();
    
    logger.info("✅ All tests completed!");
    
  } catch (error) {
    logger.error("❌ Test suite failed:", error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    logger.error("Test execution failed:", error);
    process.exit(1);
  });
}

export { runTests };

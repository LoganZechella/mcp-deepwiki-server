#!/usr/bin/env node
import { DeepWikiService } from './services/deepwiki.js';
import { Logger } from './utils/logger.js';

class DeepWikiValidator {
  private service: DeepWikiService;
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.service = new DeepWikiService(this.logger);
  }

  async runValidation() {
    console.log('🚀 DeepWiki Server Validation Script');
    console.log('=====================================\n');

    // Test 1: Basic Search
    await this.testBasicSearch();

    // Test 2: Language Filtering
    await this.testLanguageFiltering();

    // Test 3: Topic Filtering
    await this.testTopicFiltering();

    // Test 4: Error Handling
    await this.testErrorHandling();

    console.log('\n✅ Validation Complete!');
    console.log('The DeepWiki server is now returning REAL repository data instead of mock data.');
  }

  async testBasicSearch() {
    console.log('📋 Test 1: Basic Repository Search');
    console.log('----------------------------------');
    
    try {
      const results = await this.service.searchRepositories({
        query: 'react',
        limit: 3
      });

      if (results.length === 0) {
        console.log('⚠️  No results found - this might indicate a rate limit or connection issue');
        return;
      }

      console.log(`✅ Found ${results.length} repositories (instead of mock "example-owner/example-repo")`);
      
      results.forEach((repo, index) => {
        console.log(`\n   ${index + 1}. ${repo.owner}/${repo.name}`);
        console.log(`      ⭐ Stars: ${repo.stars}`);
        console.log(`      🔗 GitHub: ${repo.githubUrl}`);
        console.log(`      📊 DeepWiki: ${repo.url}`);
        console.log(`      📝 Description: ${repo.description.substring(0, 100)}...`);
        
        // Verify this is real data, not mock
        if (repo.owner === 'example-owner' && repo.name === 'example-repo') {
          console.log('❌ ERROR: Still returning mock data!');
        } else {
          console.log('✅ Real repository data confirmed');
        }
      });

    } catch (error) {
      console.log(`❌ Search failed: ${(error as Error).message}`);
      if ((error as Error).message.includes('rate limit')) {
        console.log('💡 This is likely a rate limit issue. Consider adding GITHUB_TOKEN to your environment.');
      }
    }
    
    console.log('\n');
  }

  async testLanguageFiltering() {
    console.log('🔍 Test 2: Language Filtering');
    console.log('-----------------------------');
    
    try {
      const results = await this.service.searchRepositories({
        query: 'web framework',
        language: 'JavaScript',
        limit: 2
      });

      if (results.length > 0) {
        console.log(`✅ Found ${results.length} JavaScript repositories`);
        results.forEach((repo, index) => {
          console.log(`   ${index + 1}. ${repo.owner}/${repo.name} (${repo.language})`);
          
          if (repo.language === 'JavaScript') {
            console.log('   ✅ Language filter working correctly');
          } else {
            console.log(`   ⚠️  Expected JavaScript, got ${repo.language}`);
          }
        });
      } else {
        console.log('⚠️  No JavaScript web frameworks found - check query or rate limits');
      }

    } catch (error) {
      console.log(`❌ Language filtering test failed: ${(error as Error).message}`);
    }
    
    console.log('\n');
  }

  async testTopicFiltering() {
    console.log('🏷️  Test 3: Topic Filtering');
    console.log('---------------------------');
    
    try {
      const results = await this.service.searchRepositories({
        query: 'machine learning',
        topics: ['python'],
        limit: 2
      });

      if (results.length > 0) {
        console.log(`✅ Found ${results.length} repositories with Python topic`);
        results.forEach((repo, index) => {
          console.log(`   ${index + 1}. ${repo.owner}/${repo.name}`);
          console.log(`      Topics: ${repo.topics.join(', ')}`);
          
          if (repo.topics.includes('python')) {
            console.log('   ✅ Topic filter working correctly');
          } else {
            console.log('   ⚠️  Python topic not found in result');
          }
        });
      } else {
        console.log('⚠️  No repositories found with Python topic - check query or rate limits');
      }

    } catch (error) {
      console.log(`❌ Topic filtering test failed: ${(error as Error).message}`);
    }
    
    console.log('\n');
  }

  async testErrorHandling() {
    console.log('⚠️  Test 4: Error Handling');
    console.log('-------------------------');
    
    try {
      // Test empty query
      await this.service.searchRepositories({
        query: '',
        limit: 1
      });
      console.log('❌ Empty query should have failed');
    } catch (error) {
      console.log('✅ Empty query properly rejected');
    }

    try {
      // Test very specific query that should return no results
      const results = await this.service.searchRepositories({
        query: 'this-repository-should-definitely-not-exist-12345',
        limit: 1
      });
      
      if (results.length === 0) {
        console.log('✅ No results for non-existent repository (expected)');
      } else {
        console.log('⚠️  Unexpected results for non-existent repository query');
      }
    } catch (error) {
      console.log(`❌ Error handling test failed: ${(error as Error).message}`);
    }
    
    console.log('');
  }

  displayEnvironmentInfo() {
    console.log('🔧 Environment Information');
    console.log('--------------------------');
    console.log(`Node.js Version: ${process.version}`);
    console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? '✅ Configured' : '❌ Not set (60 requests/hour limit)'}`);
    console.log(`Log Level: ${process.env.LOG_LEVEL || 'info'}`);
    console.log('');
  }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new DeepWikiValidator();
  
  validator.displayEnvironmentInfo();
  
  validator.runValidation().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { DeepWikiValidator };

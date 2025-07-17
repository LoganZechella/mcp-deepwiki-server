
// Jest test setup file
import { jest } from '@jest/globals';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeEach(() => {
  // Reset console mocks before each test
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.debug = jest.fn();
});

afterEach(() => {
  // Restore console after each test
  Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockFetch: (responses: any[]) => {
    let callCount = 0;
    return jest.fn().mockImplementation(() => {
      const response = responses[callCount] || responses[responses.length - 1];
      callCount++;
      return Promise.resolve({
        ok: response.ok !== false,
        status: response.status || 200,
        text: () => Promise.resolve(response.text || ''),
        json: () => Promise.resolve(response.json || {})
      });
    });
  }
};

// Declare global types for TypeScript
declare global {
  var testUtils: {
    sleep: (ms: number) => Promise<void>;
    createMockFetch: (responses: any[]) => jest.Mock;
  };
}

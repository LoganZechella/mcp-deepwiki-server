// Global test setup for ES modules
import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.LOG_LEVEL = 'error'; // Suppress logs during testing
process.env.NODE_ENV = 'test';

// Mock console methods to prevent test output pollution
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
});

// Global timeout for all tests
jest.setTimeout(30000);

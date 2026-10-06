import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
describe('configuration', () => {
  it('rejects missing connection settings', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
  });
  it('does not reveal supplied secret values in validation errors', () => {
    expect(() => loadConfig({ DATABASE_URL: 'secret-value' })).toThrow('Invalid configuration keys');
    try { loadConfig({ DATABASE_URL: 'secret-value' }); }
    catch (error) { expect(String(error)).not.toContain('secret-value'); }
  });
});

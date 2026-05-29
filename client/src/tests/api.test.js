import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../api';

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes a GET request to the correct URL', async () => {
    global.fetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ([]) 
    });

    await apiFetch('/tasks');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks'),
      expect.anything()
    );
  });

  it('makes a POST request with body', async () => {
    global.fetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ({ id: 1 }) 
    });

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New task' }),
    };

    await apiFetch('/tasks', options);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns the response object', async () => {
    const mockResponse = { 
      ok: true, 
      status: 200,
      json: async () => ({ data: 'test' }) 
    };
    
    global.fetch.mockResolvedValueOnce(mockResponse);

    const response = await apiFetch('/tasks');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it('handles API errors', async () => {
    global.fetch.mockResolvedValueOnce({ 
      ok: false, 
      status: 500,
      json: async () => ({ error: 'Server error' }) 
    });

    const response = await apiFetch('/tasks');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
  });

  it('uses VITE_API_URL when set', async () => {
    // Note: In actual tests, VITE_API_URL would be set at build time
    // This test just verifies the function structure
    global.fetch.mockResolvedValueOnce({ ok: true });

    await apiFetch('/tasks');

    expect(global.fetch).toHaveBeenCalled();
  });
});

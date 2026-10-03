import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubUrl } from '../scrubEvent';

const UUID = '3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b';

describe('scrubUrl', () => {
  it('drops query and fragment, and scrubs ids in the path', () => {
    expect(scrubUrl(`https://x.supabase.co/rest/v1/staff?email=eq.a@b.co#frag`)).toBe(
      'https://x.supabase.co/rest/v1/staff',
    );
    expect(scrubUrl(`https://app/llaves/${UUID}`)).toBe('https://app/llaves/[uuid]');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });

  it('keeps method/status/url (scrubbed) and drops everything else from data', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: {
        method: 'POST',
        status_code: 409,
        url: 'https://x.supabase.co/rest/v1/rpc/create_order?select=*',
        request_body: '{"email":"a@b.co"}',
      },
    });
    expect(crumb?.data).toEqual({
      method: 'POST',
      status_code: 409,
      url: 'https://x.supabase.co/rest/v1/rpc/create_order',
    });
  });
});

describe('scrubEvent', () => {
  it('scrubs messages, exception values, request, user and extra', () => {
    const event = scrubEvent({
      message: 'failed for vecino@example.com',
      exception: { values: [{ type: 'Error', value: `Key (email)=(a@b.co) id ${UUID}` }] },
      request: {
        url: `https://app/admin/buildings/${UUID}?q=juan`,
        headers: { 'User-Agent': 'UA', Referer: 'https://app/?token=eyJa.b.c', Cookie: 'sb=1' },
        cookies: { sb: '1' },
      },
      user: { id: 'staff-1', email: 'a@b.co', username: 'juan', ip_address: '1.2.3.4' },
      extra: { payload: { error: new Error('tel 1234567890') } },
      breadcrumbs: [
        { category: 'console', message: 'secret' },
        { category: 'navigation', data: { to: `/x/${UUID}` } },
      ],
    });

    expect(event.message).toBe('failed for [email]');
    expect(event.exception?.values?.[0]?.value).toBe('Key (email)=([redacted]) id [uuid]');
    expect(event.request).toEqual({
      url: 'https://app/admin/buildings/[uuid]',
      headers: { 'User-Agent': 'UA' },
    });
    expect(event.user).toEqual({ id: 'staff-1' });
    expect(event.extra).toEqual({
      payload: { error: { kind: 'error', name: 'Error', message: 'tel [num]' } },
    });
    expect(event.breadcrumbs).toEqual([{ category: 'navigation', data: { to: '/x/[uuid]' } }]);
  });

  it('removes a user without an id', () => {
    const event = scrubEvent({ user: { email: 'a@b.co' } });
    expect(event.user).toBeUndefined();
  });
});

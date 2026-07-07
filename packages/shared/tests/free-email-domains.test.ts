import { describe, it, expect } from 'vitest';
import { FREE_EMAIL_DOMAINS, isDomainDenied } from '../src/free-email-domains.js';

describe('isDomainDenied', () => {
  it('rejects exact free-provider domains', () => {
    expect(isDomainDenied('gmail.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('outlook.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('icloud.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('proton.me', FREE_EMAIL_DOMAINS)).toBe(true);
  });

  it('rejects any TLD under a wildcard pattern', () => {
    expect(isDomainDenied('yahoo.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('yahoo.co.uk', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('yahoo.fr', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('hotmail.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('hotmail.co.in', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('gmx.de', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('gmx.net', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('yandex.ru', FREE_EMAIL_DOMAINS)).toBe(true);
  });

  it('does NOT reject a domain that merely ends with a wildcard base', () => {
    // "myyahoo.com" starts with "yahoo" only after a prefix, not at the dot,
    // so the "yahoo.*" pattern must not match it.
    expect(isDomainDenied('myyahoo.com', FREE_EMAIL_DOMAINS)).toBe(false);
    expect(isDomainDenied('notyahoo.com', FREE_EMAIL_DOMAINS)).toBe(false);
  });

  it('rejects disposable providers', () => {
    expect(isDomainDenied('mailinator.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('10minutemail.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('guerrillamail.com', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('sharklasers.com', FREE_EMAIL_DOMAINS)).toBe(true);
  });

  it('accepts real company domains', () => {
    expect(isDomainDenied('acme-corp.com', FREE_EMAIL_DOMAINS)).toBe(false);
    expect(isDomainDenied('stripe.com', FREE_EMAIL_DOMAINS)).toBe(false);
    expect(isDomainDenied('anything.example-startup.io', FREE_EMAIL_DOMAINS)).toBe(false);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isDomainDenied('  GMAIL.COM  ', FREE_EMAIL_DOMAINS)).toBe(true);
    expect(isDomainDenied('Yahoo.Co.UK', FREE_EMAIL_DOMAINS)).toBe(true);
  });

  it('handles an empty domain safely', () => {
    expect(isDomainDenied('', FREE_EMAIL_DOMAINS)).toBe(false);
  });

  it('respects admin-added exact domains independent of the builtin list', () => {
    const adminList = ['free-mails.example', 'notreal.org'];
    expect(isDomainDenied('free-mails.example', adminList)).toBe(true);
    expect(isDomainDenied('other.example', adminList)).toBe(false);
  });
});

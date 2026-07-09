import { describe, it, expect } from 'vitest';
import { CareerPacketSchema } from '../src/career-packet.js';

describe('CareerPacketSchema', () => {
  it('accepts a minimal valid packet', () => {
    const result = CareerPacketSchema.safeParse({
      identity: { fullName: 'Alice' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identity.fullName).toBe('Alice');
      expect(result.data.taglines).toEqual([]);
      expect(result.data.experience).toEqual([]);
    }
  });

  it('rejects a packet missing identity', () => {
    const result = CareerPacketSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('strips unknown top-level fields', () => {
    const result = CareerPacketSchema.parse({
      identity: { fullName: 'Alice' },
      unknownField: 123,
      anotherUnknown: 'test',
    });
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    expect((result as Record<string, unknown>).anotherUnknown).toBeUndefined();
    expect(result.identity.fullName).toBe('Alice');
  });

  it('accepts a fully populated packet', () => {
    const result = CareerPacketSchema.safeParse({
      identity: {
        fullName: 'Alice Rivera',
        email: 'alice@example.com',
        phone: '555-0100',
        location: 'San Francisco',
        linkedinUrl: 'https://linkedin.com/in/alice',
        githubUrl: 'https://github.com/alice',
        portfolioUrl: 'https://alice.dev',
      },
      taglines: [
        { archetype: 'swe', text: 'Full-stack engineer' },
        { archetype: 'ml_eng', text: 'ML systems builder' },
      ],
      experience: [
        {
          company: 'Acme Corp',
          title: 'Senior Engineer',
          startDate: '2020-01',
          endDate: '2024-01',
          bullets: [
            { text: 'Built the thing', context: 'Led a team' },
          ],
        },
      ],
      projects: [
        { slug: 'tscrate', name: 'TSCrate', tagline: 'TypeScript scaffolding', url: 'https://github.com' },
      ],
      skills: [
        { name: 'TypeScript', category: 'language', proficiency: 'expert' },
      ],
      education: [
        { institution: 'University of California', degree: 'BS', field: 'CS' },
      ],
      summary: 'A fine engineer.',
      version: 'v42',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.experience[0]!.bullets[0]!.text).toBe('Built the thing');
      expect(result.data.projects[0]!.slug).toBe('tscrate');
      expect(result.data.version).toBe('v42');
    }
  });
});

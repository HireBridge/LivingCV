import { z } from 'zod';

export const CareerIdentity = z.object({
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
});
export type CareerIdentity = z.infer<typeof CareerIdentity>;

export const CareerTagline = z.object({
  archetype: z.string(),
  text: z.string(),
});
export type CareerTagline = z.infer<typeof CareerTagline>;

export const CareerBullet = z.object({
  text: z.string(),
  context: z.string().optional(),
});
export type CareerBullet = z.infer<typeof CareerBullet>;

export const CareerExperience = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  bullets: z.array(CareerBullet).default([]),
});
export type CareerExperience = z.infer<typeof CareerExperience>;

export const CareerProjectSignal = z.object({
  slug: z.string(),
  name: z.string(),
  tagline: z.string().optional(),
  url: z.string().optional(),
});
export type CareerProjectSignal = z.infer<typeof CareerProjectSignal>;

export const CareerSkill = z.object({
  name: z.string(),
  category: z.string().optional(),
  proficiency: z.string().optional(),
});
export type CareerSkill = z.infer<typeof CareerSkill>;

export const CareerEducation = z.object({
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type CareerEducation = z.infer<typeof CareerEducation>;

export const CareerPacketSchema = z.object({
  identity: CareerIdentity,
  taglines: z.array(CareerTagline).default([]),
  experience: z.array(CareerExperience).default([]),
  projects: z.array(CareerProjectSignal).default([]),
  skills: z.array(CareerSkill).default([]),
  education: z.array(CareerEducation).default([]),
  summary: z.string().optional(),
  version: z.string().optional(),
});
export type CareerPacket = z.infer<typeof CareerPacketSchema>;

import { vi } from 'vitest';

const mockGenerateContent = vi.fn();

export const GoogleGenerativeAI = vi.fn().mockImplementation(() => ({
  getGenerativeModel: vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  }),
}));

export { mockGenerateContent };

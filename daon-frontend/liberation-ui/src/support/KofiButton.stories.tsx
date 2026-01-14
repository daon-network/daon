import type { Story } from '@ladle/react';
import { KofiButton } from './KofiButton';

export const AllVariants: Story = () => (
  <div className="p-8 bg-gray-50 min-h-screen">
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">Ko-fi Support Button</h1>
      
      <div className="space-y-8">
        <div className="bg-white rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Button Variant</h3>
          <div className="flex flex-wrap gap-4">
            <KofiButton size="small" variant="button" />
            <KofiButton size="medium" variant="button" />
            <KofiButton size="large" variant="button" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Badge Variant</h3>
          <div className="flex flex-wrap gap-4">
            <KofiButton size="small" variant="badge" />
            <KofiButton size="medium" variant="badge" />
            <KofiButton size="large" variant="badge" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Minimal Variant</h3>
          <div className="flex items-center gap-2">
            <span>Support the project</span>
            <KofiButton variant="minimal" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
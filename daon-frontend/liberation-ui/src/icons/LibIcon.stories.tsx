import type { Story } from '@ladle/react';
import { LibIcon, LiberationIcons } from './LibIcon';

export const AllIcons: Story = () => (
  <div className="p-8 bg-gray-50 min-h-screen">
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">Liberation Icon System</h1>
      <p className="text-gray-600 mb-8">39 semantic icons for values-aligned interfaces</p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Object.keys(LiberationIcons).map((iconName) => (
          <div key={iconName} className="flex flex-col items-center p-4 bg-white rounded-lg border hover:shadow-md transition-shadow">
            <LibIcon icon={iconName as any} size="lg" className="text-blue-600 mb-2" />
            <span className="text-xs text-gray-700 text-center">{iconName}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const IconSizes: Story = () => (
  <div className="p-8 bg-white">
    <h2 className="text-2xl font-bold mb-6">Icon Sizes</h2>
    <div className="flex items-center gap-8">
      <div className="text-center">
        <LibIcon icon="Freedom" size="xs" className="text-blue-600" />
        <p className="text-xs mt-2">xs</p>
      </div>
      <div className="text-center">
        <LibIcon icon="Freedom" size="sm" className="text-blue-600" />
        <p className="text-xs mt-2">sm</p>
      </div>
      <div className="text-center">
        <LibIcon icon="Freedom" size="md" className="text-blue-600" />
        <p className="text-xs mt-2">md</p>
      </div>
      <div className="text-center">
        <LibIcon icon="Freedom" size="lg" className="text-blue-600" />
        <p className="text-xs mt-2">lg</p>
      </div>
      <div className="text-center">
        <LibIcon icon="Freedom" size="xl" className="text-blue-600" />
        <p className="text-xs mt-2">xl</p>
      </div>
    </div>
  </div>
);
'use client';

/**
 * Bulk Register Form Component
 *
 * Upload and register multiple content items at once
 */

import React, { useState } from 'react';

interface BulkItem {
  title: string;
  author: string;
  content: string;
  license: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  hash?: string;
}

export default function BulkRegisterForm() {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target?.result as string;
      const lines = csv.split('\n');

      // Skip header row
      const parsedItems: BulkItem[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [title, author, content, license] = line.split(',').map(s => s.trim());

        if (title && content) {
          parsedItems.push({
            title,
            author: author || 'Unknown',
            content,
            license: license || 'liberation_v1',
            status: 'pending',
          });
        }
      }

      setItems(parsedItems);
    };

    reader.readAsText(file);
  };

  const handleJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const parsedItems: BulkItem[] = Array.isArray(json) ? json : [json];

        setItems(
          parsedItems.map((item) => ({
            title: item.title || 'Untitled',
            author: item.author || 'Unknown',
            content: item.content || '',
            license: item.license || 'liberation_v1',
            status: 'pending',
          }))
        );
      } catch (err) {
        alert('Invalid JSON file');
      }
    };

    reader.readAsText(file);
  };

  const processBulkRegistration = async () => {
    if (items.length === 0 || items.length > 100) {
      alert('Please upload between 1 and 100 items');
      return;
    }

    setProcessing(true);
    setCurrentIndex(0);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

    // Process items one at a time to show progress
    for (let i = 0; i < items.length; i++) {
      setCurrentIndex(i);
      const item = items[i];

      // Update status to processing
      setItems((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: 'processing' } : p
        )
      );

      try {
        const response = await fetch(`${apiUrl}/protect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: item.content,
            metadata: {
              title: item.title,
              author: item.author,
            },
            license: item.license,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setItems((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'success', hash: data.contentHash }
                : p
            )
          );
        } else {
          throw new Error(data.message || 'Registration failed');
        }
      } catch (err) {
        setItems((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: 'error',
                  error: err instanceof Error ? err.message : 'Unknown error',
                }
              : p
          )
        );
      }

      // Small delay to prevent overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setProcessing(false);
  };

  const downloadResults = () => {
    const csv = [
      'Title,Author,Status,Hash,Error',
      ...items.map((item) =>
        [
          item.title,
          item.author,
          item.status,
          item.hash || '',
          item.error || '',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-registration-results-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const successCount = items.filter((i) => i.status === 'success').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">
          How to Use Bulk Registration
        </h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Prepare a CSV or JSON file with your content (max 100 items)</li>
          <li>CSV format: title, author, content, license (one per line)</li>
          <li>JSON format: array of objects with title, author, content, license fields</li>
          <li>Upload your file and review the items</li>
          <li>Click "Start Registration" to protect all items</li>
        </ol>
      </div>

      {/* File Upload */}
      {items.length === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="text-center text-gray-500">or</div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload JSON File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleJSONUpload}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      )}

      {/* Items List */}
      {items.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-semibold text-gray-900">
                {items.length} items loaded
              </p>
              {processing && (
                <p className="text-sm text-gray-600">
                  Processing: {currentIndex + 1} of {items.length}
                </p>
              )}
              {!processing && successCount > 0 && (
                <p className="text-sm text-green-600">
                  ✓ {successCount} successful, {errorCount} errors
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {!processing && successCount === 0 && (
                <>
                  <button
                    onClick={() => setItems([])}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={processBulkRegistration}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md hover:from-purple-700 hover:to-pink-700 transition-colors"
                  >
                    Start Registration
                  </button>
                </>
              )}
              {successCount > 0 && (
                <button
                  onClick={downloadResults}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Download Results
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {processing && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${((currentIndex + 1) / items.length) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Items Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Author
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-sm text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {item.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.author}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.status === 'pending' && (
                        <span className="text-gray-500">Pending</span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-blue-600">Processing...</span>
                      )}
                      {item.status === 'success' && (
                        <span className="text-green-600">✓ Success</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-600" title={item.error}>
                          ✗ Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

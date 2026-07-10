'use client';
import { useState } from 'react';

export function ImageUploader({ format = 'html' }: { format?: 'html' | 'markdown' }) {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    setUploadedUrl(null);
    
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadedUrl(data.url);
      } else {
        alert('Upload failed: ' + data.error);
      }
    } catch {
      alert('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const codeSnippet = format === 'markdown' 
    ? `![Uploaded image](${uploadedUrl})`
    : `<img src="${uploadedUrl}" alt="Uploaded image" />`;

  return (
    <div style={{ padding: 16, background: 'var(--paper-deep)', borderRadius: 6, marginBottom: 20, border: '1px solid var(--rule)' }}>
      <h4 style={{ margin: '0 0 10px 0' }}>Image Uploader</h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: '0 0 12px 0' }}>
        Upload an image to get a tag you can paste into your {format === 'markdown' ? 'Markdown' : 'HTML'} content.
      </p>
      <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
      {uploading && <span style={{ marginLeft: 10, fontSize: '0.9rem' }}>Uploading...</span>}
      {uploadedUrl && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: 'var(--signal)' }}>Upload successful! Copy this tag:</p>
          <code style={{ display: 'block', padding: 8, background: 'var(--paper)', borderRadius: 4, border: '1px solid var(--rule)' }}>
            {codeSnippet}
          </code>
        </div>
      )}
    </div>
  );
}
